/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const select = require('unist-util-select');
const visit = require('unist-util-visit');
const toHAST = require('mdast-util-to-hast');
const toHTML = require('hast-util-to-html');
const mdastSqueezeParagraphs = require('mdast-squeeze-paragraphs');
const mdastFlattenImages = require('mdast-flatten-image-paragraphs');
const mdastFlattenLists = require('mdast-flatten-listitem-paragraphs');


/**
 * The LayoutMachine is an implmentation of a state machine pattern
 * that tries to intelligently lay out the page.
 */
const LayoutMachine = {
  /*
    States:
      init -> hero, flow
      hero -> flow
  */
  validStates: ['masthead', 'hero', 'gallery'],
  states: ['init'],
  get state() {
    return this.states[this.states.length - 1];
  },
  set state(v) {
    // console.log(`${this.state} -> ${v}`);
    this.states.push(v);
    return v;
  },
  layout: function (section) {
    // allow manual overide of class
    // this might be instant-cruft–discuss.
    if (section.class && section.class.length) {
      // If class is a valid state, use it, otherwise default to 'flow'
      if (this.validStates.includes(section.class)) {
        this.states.push(section.class);
      } else {
        this.states.push('flow');
      }
    } else {
      switch (this.state) {
        case 'init':
          if (this.isHero(section)) {
            this.state = 'hero';
          } else {
            if (this.isGallery(section)) {
              this.state = 'gallery';
            } else {
              this.state = 'flow';
            }
          }
          break;
        case 'flow':
        case 'hero':
          if (this.isGallery(section)) {
            this.state = 'gallery';
          } else {
            this.state = 'flow';
          }
          break;
      }
      section.class = this.state;
    }

    let children = [];
    for (let e of section.children) {
      children.push(e);
    }
    section.children = children;
    return section;
  },

  isMast(section) {
    // If the section has an h2 & an image in the first level, it's a hero

    <section class="masthead">
      <div class="container d-flex h-100 align-items-center">
        <div class="mx-auto text-center">
          <h1 class="mx-auto my-0 text-uppercase">Grayscale</h1>
          <p class="text-white-50 mx-auto mt-2 mb-5">A free, responsive, one page Bootstrap theme created by Start Bootstrap.</p>
          <a href="#about" class="btn btn-primary js-scroll-trigger">Get Started</a>
        </div>
      </div>
    </section>

    const image = select(section, 'image');
    const h = select(section, 'heading');
    return (h.length == 1 && (h[0].depth == 1 || h[0].depth == 2) && image.length == 1);
  },

  isGallery(section) {
    // If the section has more than 2 images, it is a gallery
    const image = select(section, 'image');
    return image.length > 2
  },
}

function getSmartDesign(mdast) {
  mdast = mdastFlattenImages()(mdast);
  mdast = mdastFlattenLists()(mdast);
  mdast = mdastSqueezeParagraphs(mdast);

  const mdastNodes = mdast.children;

  const sections = [];
  let currentSection = {
    children: [],
    type: 'standard'
  };

  let title;

  mdastNodes.forEach(function (node) {
    if (node.type == "heading" && node.depth == 1 && !title) {
      title = node.children[0].value;
      return;
    }
    if (node.type == "thematicBreak") {
      sections.push(LayoutMachine.layout(currentSection));
      currentSection = {
        children: [],
        type: 'standard'
      };
    } else {
      currentSection.children.push(node);
    }
  });

  sections.push(LayoutMachine.layout(currentSection));
  return sections;
}

function computeSectionsHAST(sections) {
  const nodes = [];
  let odd = false;
  sections.forEach(function (section) {
    const hast = toHAST(section);
    const htmlNodes = [];
    hast.children.forEach(function (h) {
      htmlNodes.push(toHTML(h));
    });
    nodes.push({
      type: "element",
      properties: {
        className: section.class + ' ' + ((odd = !odd) ? 'odd' : 'even'),
      },
      tagName: 'section',
      children: hast.children
    });
  });
  return nodes;
}

/**
 * The 'pre' function that is executed before the HTML is rendered
 * @param payload The current payload of processing pipeline
 */
function pre(payload) {

  // banner is first image and banner text is image alt
  payload.content.banner = {
    img: '',
    text: ''
  };
  const firstImg = select(payload.content.mdast, 'image');
  if (firstImg.length > 0) {
    payload.content.banner = {
      img: firstImg[0].url,
      text: firstImg[0].alt
    }
  }

  const sections = getSmartDesign(payload.content.mdast);
  const sectionsHAST = computeSectionsHAST(sections);
  const html = toHTML({
    type: 'root',
    children: sectionsHAST
  })
  payload.content.sections = html;

  // avoid htl execution error if missing
  payload.content.meta = payload.content.meta || {};
  payload.content.meta.references = payload.content.meta.references || [];
  payload.content.meta.icon = payload.content.meta.icon || '';
}

module.exports.pre = pre;
