/**
 * Platform-specific capabilities live behind interfaces here — screens
 * must never touch window/document/DOM or raw <input type="file">
 * directly, only through a concrete per-platform implementation.
 */
export interface PickedFile {
  uri: string;
  name: string;
}

export interface FilePicker {
  pickOne(accept: string): Promise<PickedFile | null>;
}
