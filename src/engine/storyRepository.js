import { lintStory, mergeStory, normalizeStory, partNames, resolveEntry } from './storyFlow.js';

// The story: the main file and the parts it lists, beside it (D37). Every file is revalidated (`no-cache`), so
// Pages' ~10-minute cache can't pair a new main file with an old part (D31).
export class StoryRepository {
  constructor(story) {
    Object.assign(this, story); // id, start, menuMusic, resumeMusic, assets, characters, scenes, movedScenes, locations (Maps)
  }

  static async load(url) {
    const base = new URL(url, document.baseURI);
    const main = await fetchJson(base);
    const warnings = [];
    const names = partNames(main); // mergeStory reports a repeated name
    const parts = new Map(await Promise.all(names.map(async (name) => [name, await fetchJson(new URL(name, base))])));
    const story = StoryRepository.fromData(mergeStory(main, parts, warnings), warnings);
    for (const warning of warnings) console.warn(`Story: ${warning}`);
    return story;
  }

  /** The merged story checked and normalised; throws when it can't be played. Warnings go into the list. */
  static fromData(data, warnings = []) {
    if (!data.start) throw new Error('Story JSON is missing "start".');
    const story = normalizeStory(data, warnings);
    if (story.scenes.size === 0) throw new Error('Story JSON has no scenes.');
    if (resolveEntry(story, story.start, new Map()).dead) throw new Error(`Story start "${data.start}" leads nowhere.`);
    warnings.push(...lintStory(story));
    return new StoryRepository(story);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load story file: ${url}`);
  return response.json();
}
