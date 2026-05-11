// Rehype plugin: wrap any markdown image that sits alone in its paragraph
// into a <figure> with a <figcaption> built from the image's alt text.
//
// In:    <p><img alt="Bender on the floor" src="..."></p>
// Out:   <figure class="gallery-figure">
//          <img alt="Bender on the floor" src="..." />
//          <figcaption>Bender on the floor</figcaption>
//        </figure>
//
// Images that share a paragraph with other text are left alone — those are
// inline figures, not gallery items.

export default function rehypeImageCaptions() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (
          child.type === 'element' &&
          child.tagName === 'p' &&
          Array.isArray(child.children) &&
          child.children.length === 1 &&
          child.children[0].type === 'element' &&
          child.children[0].tagName === 'img' &&
          child.children[0].properties?.alt
        ) {
          const img = child.children[0];
          const alt = String(img.properties.alt);
          node.children[i] = {
            type: 'element',
            tagName: 'figure',
            properties: { className: ['gallery-figure'] },
            children: [
              img,
              {
                type: 'element',
                tagName: 'figcaption',
                properties: {},
                children: [{ type: 'text', value: alt }],
              },
            ],
          };
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
