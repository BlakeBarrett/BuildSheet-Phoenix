/**
 * imageStorageService.ts
 * Handles uploading and deleting generated images in Firebase Storage
 * so they are accessible across devices.
 */
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseStorage } from './firebase.ts';
import { UserService } from './userService.ts';

/**
 * Upload a base64 data URL image to Firebase Storage.
 * Returns { storageUrl, storagePath } on success, or null on failure.
 */
export async function uploadImageToStorage(
  projectId: string,
  imageId: string,
  dataUrl: string
): Promise<{ storageUrl: string; storagePath: string } | null> {
  const storage = getFirebaseStorage();
  const user = UserService.getCurrentUser();
  if (!storage || !user) return null;

  try {
    const storagePath = `users/${user.id}/projects/${projectId}/images/${imageId}.jpg`;
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, dataUrl, 'data_url');
    const storageUrl = await getDownloadURL(storageRef);
    console.log(`[ImageStorage] ✓ Uploaded image ${imageId} for project ${projectId}`);
    return { storageUrl, storagePath };
  } catch (e) {
    console.error('[ImageStorage] Upload failed:', e);
    return null;
  }
}

/**
 * Delete an image from Firebase Storage by its storage path.
 */
export async function deleteImageFromStorage(storagePath: string): Promise<void> {
  const storage = getFirebaseStorage();
  if (!storage) return;
  try {
    await deleteObject(ref(storage, storagePath));
    console.log(`[ImageStorage] ✓ Deleted ${storagePath}`);
  } catch (e) {
    console.warn('[ImageStorage] Delete failed (may already be gone):', e);
  }
}
