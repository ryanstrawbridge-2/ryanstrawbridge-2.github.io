// Vanilla port of the parts of `tinacms/dist/react` that power click-to-edit.
// Tina ships that logic as React hooks, but the underlying mechanism is just
// postMessage — so a static Astro site can participate without React.
//
// The admin trusts the `id` the page sends in its `open` message, so our query
// string only has to be valid GraphQL, not byte-identical to Tina's generated
// document.

export const hashFromQuery = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) & 4294967295;
  }
  return Math.abs(hash).toString(36);
};

export const queryId = (query: string, variables: Record<string, unknown>): string =>
  hashFromQuery(JSON.stringify({ query, variables }));

const HOME_PARTS = `fragment HomeParts on Home {
  __typename
  hero { __typename eyebrow tagline lede primaryCta { __typename label href } secondaryCta { __typename label href } headshotShape }
  showcase { __typename show }
  projectsSection { __typename show eyebrow title }
  experienceSection { __typename show eyebrow title logoSize items { __typename role org blurb logoKey } }
  aboutSection { __typename show photoPosition photoFocalPoint eyebrow heading lede bio }
  interestsSection { __typename show eyebrow title items { __typename title imageKey extraImageKeys alt body } }
  contactSection { __typename show eyebrow heading body email phone }
}`;

const PROJECT_PARTS = `fragment ProjectParts on Project {
  __typename
  title subtitle organization date summary hero heroAlt heroFocalPoint heroAspect galleryLayout tools order draft body
}`;

const DOCUMENT_SYS = `... on Document {
      _sys { filename basename hasReferences breadcrumbs path relativePath extension }
      id
    }`;

export const HOME_QUERY = `${HOME_PARTS}

query home($relativePath: String!) {
  home(relativePath: $relativePath) {
    ${DOCUMENT_SYS}
    ...HomeParts
  }
}`;

export const PROJECT_QUERY = `${PROJECT_PARTS}

query project($relativePath: String!) {
  project(relativePath: $relativePath) {
    ${DOCUMENT_SYS}
    ...ProjectParts
  }
}`;

export const HOME_VARIABLES = { relativePath: 'home.json' };

const HOME_ID = queryId(HOME_QUERY, HOME_VARIABLES);

/** Field reference for the home document, e.g. homeField('hero', 'tagline'). */
export const homeField = (...path: (string | number)[]): string =>
  `${HOME_ID}---home.${path.join('.')}`;

/** Field reference for a project document. `slug` is the markdown filename. */
export const projectField = (slug: string, ...path: (string | number)[]): string => {
  const id = queryId(PROJECT_QUERY, { relativePath: `${slug}.md` });
  return `${id}---project.${path.join('.')}`;
};

/**
 * Wraps raw JSON in the shape Tina's GraphQL layer would return, so the admin
 * can render an initial form before its own query resolves.
 */
export const asTinaDocument = <T extends object>(
  typename: string,
  relativePath: string,
  collectionPath: string,
  data: T,
) => {
  const filename = relativePath.replace(/\.[^.]+$/, '');
  const extension = relativePath.slice(relativePath.lastIndexOf('.'));
  return {
    __typename: typename,
    id: `${collectionPath}/${relativePath}`,
    _sys: {
      filename,
      basename: relativePath,
      hasReferences: false,
      breadcrumbs: [filename],
      path: `${collectionPath}/${relativePath}`,
      relativePath,
      extension,
    },
    ...data,
  };
};
