/*
 * Removes a photo's background off the page's main thread, so the Records
 * page keeps drawing (its progress bar, the review tools) while the model
 * runs. Its first job also downloads the model.
 */
import { removeBackground } from '@imgly/background-removal';

self.onmessage = async ({ data: { id, file } }) => {
  try {
    self.postMessage({ id, blob: await removeBackground(file) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
