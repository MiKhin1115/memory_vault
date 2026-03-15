import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import './App.css';

type UploadState = 'idle' | 'submitting' | 'success' | 'error';

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_PHOTOS_PER_SUBMISSION = 20;

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

const ACCEPTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];

function App() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [status, setStatus] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  const isSubmitting = status === 'submitting';
  const hasPhotos = photos.length > 0;

  const photoCountLabel = useMemo(() => {
    if (photos.length === 1) {
      return '1 photo ready to send';
    }

    return `${photos.length} photos ready to send`;
  }, [photos.length]);

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
      if (currentPhotos.length >= MAX_PHOTOS_PER_SUBMISSION) {
        setError(`You can upload up to ${MAX_PHOTOS_PER_SUBMISSION} photos at a time.`);
        return currentPhotos;
      }

      const existingIds = new Set(currentPhotos.map((photo) => photo.id));
      const availableSlots = MAX_PHOTOS_PER_SUBMISSION - currentPhotos.length;
      const nextPhotos: SelectedPhoto[] = [];
      let nextError: string | null = null;

      incomingFiles.slice(0, availableSlots).forEach((file, index) => {
        if (nextError) {
          return;
        }

        const validationError = validatePhotoFile(file);

        if (validationError) {
          nextError = validationError;
          return;
        }

        const photo = {
          id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
          file,
          previewUrl: URL.createObjectURL(file),
        };

        if (existingIds.has(photo.id)) {
          URL.revokeObjectURL(photo.previewUrl);
          return;
        }

        nextPhotos.push(photo);
      });

      if (!nextError && incomingFiles.length > availableSlots) {
        nextError = `You can upload up to ${MAX_PHOTOS_PER_SUBMISSION} photos at a time.`;
      }

      if (nextError) {
        setError(nextError);
      }

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

    setStatus('submitting');
    setError(null);

    try {
      await handleUploadPlaceholder({
        guestName: name.trim(),
        message: message.trim(),
        files: photos.map(({ file }) => file),
      });

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
          <h1>Photos ready</h1>
          <p>The frontend is ready. Connect your AppCube backend when you are ready to enable upload.</p>
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

          {error && <p className="status-note is-error">{error}</p>}

          <button className="submit-button" type="submit" disabled={!hasPhotos || isSubmitting}>
            {status === 'submitting' ? 'Upload Backend Not Implemented' : 'Send Photos to Couple'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;

function revokePreviews(items: SelectedPhoto[]) {
  items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
}

function validatePhotoFile(file: File) {
  const normalizedName = file.name.toLowerCase();
  const hasAcceptedExtension = ACCEPTED_IMAGE_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  );

  if (file.type && ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return null;
  }

  if (hasAcceptedExtension) {
    return null;
  }

  return 'Please upload a JPG, PNG, HEIC, or HEIF photo.';
}

async function handleUploadPlaceholder({
  guestName,
  message,
  files,
}: {
  guestName: string;
  message: string;
  files: File[];
}) {
  console.log('Upload backend not implemented yet.', {
    guestName,
    message,
    fileCount: files.length,
  });
}
