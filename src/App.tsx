import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { uploadMultipleGuestPhotos } from './services/guestUploadService';
import './App.css';

type UploadState = 'idle' | 'compressing' | 'uploading' | 'success' | 'error';

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

const maxImageDimension = 2200;
const compressedImageQuality = 0.82;

function App() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [status, setStatus] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  const isSubmitting = status === 'compressing' || status === 'uploading';
  const hasPhotos = photos.length > 0;

  const photoCountLabel = useMemo(() => {
    if (photos.length === 1) {
      return '1 photo ready to send';
    }

    return `${photos.length} photos ready to send`;
  }, [photos.length]);

  const statusText = useMemo(() => {
    if (status === 'compressing') {
      return 'Compressing photos...';
    }

    if (status === 'uploading') {
      return 'Sending photos...';
    }

    return null;
  }, [status]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      revokePreviews(photosRef.current);
    };
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const appendFiles = (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    setError(null);
    setStatus((currentStatus) => (currentStatus === 'error' ? 'idle' : currentStatus));

    setPhotos((currentPhotos) => {
      const existingIds = new Set(currentPhotos.map((photo) => photo.id));
      const nextPhotos = incomingFiles
        .map((file, index) => ({
          id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }))
        .filter((photo) => {
          if (existingIds.has(photo.id)) {
            URL.revokeObjectURL(photo.previewUrl);
            return false;
          }

          return true;
        });

      return [...currentPhotos, ...nextPhotos];
    });
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((currentPhotos) => {
      const nextPhoto = currentPhotos.find((photo) => photo.id === id);

      if (nextPhoto) {
        URL.revokeObjectURL(nextPhoto.previewUrl);
      }

      return currentPhotos.filter((photo) => photo.id !== id);
    });
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);

    if (isSubmitting) {
      return;
    }

    appendFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (photos.length === 0) {
      setError('Please select at least one photo.');
      return;
    }

    setStatus('compressing');
    setError(null);

    try {
      const compressedFiles = await Promise.all(
        photos.map(async ({ file }) => {
          const shouldCompress = !/\.(heic|heif)$/i.test(file.name);

          if (!shouldCompress) {
            return file;
          }

          return compressImage(file);
        }),
      );

      setStatus('uploading');
      await uploadMultipleGuestPhotos(
        compressedFiles,
        name.trim() || undefined,
        message.trim() || undefined,
      );

      revokePreviews(photos);
      setPhotos([]);
      setName('');
      setMessage('');
      setStatus('success');
    } catch (submitError) {
      setStatus('error');
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong.');
    }
  };

  if (status === 'success') {
    return (
      <main className="vault-shell success-shell">
        <section className="success-card">
          <div className="success-icon">
            <Camera size={22} strokeWidth={2.2} />
          </div>
          <h1>Photos sent successfully</h1>
          <p>Thank you for sharing memories with the couple.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="vault-shell">
      <section className="vault-page">
        <header className="vault-header">
          <h1>Upload Wedding Photos</h1>
          <p>Share your favorite moments with the couple</p>
        </header>

        <form className="vault-form" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            name="photos"
            accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
            multiple
            onChange={handlePhotoChange}
            disabled={isSubmitting}
          />

          <button
            type="button"
            className={`upload-dropzone${isDragging ? ' is-dragging' : ''}${hasPhotos ? ' has-photos' : ''}`}
            onClick={openFilePicker}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={isSubmitting}
          >
            <div className="dropzone-icon">
              <Camera size={28} strokeWidth={2.2} />
            </div>
            <div className="dropzone-copy">
              <strong>Tap to Upload Photos</strong>
              <span>or drag photos here</span>
            </div>
          </button>

          {hasPhotos && (
            <section className="preview-section" aria-label="Selected photos">
              <div className="preview-header">
                <p>{photoCountLabel}</p>
              </div>

              <div className="preview-grid">
                {photos.map((photo) => (
                  <article key={photo.id} className="preview-tile">
                    <img src={photo.previewUrl} alt={photo.file.name} />
                    <button
                      type="button"
                      className="remove-photo-button"
                      aria-label={`Remove ${photo.file.name}`}
                      onClick={() => handleRemovePhoto(photo.id)}
                      disabled={isSubmitting}
                    >
                      <Trash2 size={16} strokeWidth={2.2} />
                    </button>
                  </article>
                ))}

                <button
                  type="button"
                  className="preview-tile add-more-tile"
                  onClick={openFilePicker}
                  disabled={isSubmitting}
                >
                  <Plus size={24} strokeWidth={2.2} />
                  <span>Add more</span>
                </button>
              </div>
            </section>
          )}

          <label className="compact-field">
            <span>Add a short message (optional)</span>
            <textarea
              className="compact-input compact-textarea"
              name="message"
              placeholder="Write a note"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <label className="compact-field">
            <span>Your Name (optional)</span>
            <input
              className="compact-input"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
            />
          </label>

          {(error || statusText) && (
            <p className={`status-note${error ? ' is-error' : ''}`}>{error ?? statusText}</p>
          )}

          <button className="submit-button" type="submit" disabled={!hasPhotos || isSubmitting}>
            {status === 'compressing'
              ? 'Compressing photos...'
              : status === 'uploading'
                ? 'Sending photos...'
                : 'Send Photos to Couple'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;

async function compressImage(file: File) {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const { width, height } = fitWithinBounds(image.width, image.height, maxImageDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', compressedImageQuality);
    });

    if (!blob) {
      return file;
    }

    const nextName = file.name.replace(/\.(png|jpe?g)$/i, '.jpg');
    return new File([blob], nextName, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function revokePreviews(items: SelectedPhoto[]) {
  items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to process one of the selected images.'));
    image.src = src;
  });
}

function fitWithinBounds(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round((height / width) * maxDimension),
    };
  }

  return {
    width: Math.round((width / height) * maxDimension),
    height: maxDimension,
  };
}
