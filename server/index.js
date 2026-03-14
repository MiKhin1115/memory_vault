import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadsDir = path.join(rootDir, 'uploads');
const dataDir = path.join(rootDir, 'data');
const submissionsFile = path.join(dataDir, 'submissions.json');
const distDir = path.join(rootDir, 'dist');

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

await ensureStorage();

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDir);
  },
  filename: (req, file, callback) => {
    const guestName = sanitizeSegment(req.body?.name || 'guest');
    const extension = path.extname(file.originalname).toLowerCase();
    const safeExtension = allowedExtensions.has(extension) ? extension : '.jpg';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${guestName}-${uniqueSuffix}${safeExtension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 12,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const hasValidExtension = allowedExtensions.has(extension);
    const hasValidMime = allowedMimeTypes.has(file.mimetype);

    if (hasValidExtension || hasValidMime) {
      callback(null, true);
      return;
    }

    callback(new Error('Only JPG, PNG, and HEIC photos are allowed.'));
  },
});

const app = express();

app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/add-photo', async (req, res) => {
  const { guestName = '', message = '', photoId, base64String } = req.body ?? {};

  if (typeof photoId !== 'string' || !photoId.trim()) {
    res.status(400).json({ error: 'photoId is required.' });
    return;
  }

  if (typeof base64String !== 'string' || !base64String.trim()) {
    res.status(400).json({ error: 'base64String is required.' });
    return;
  }

  const endpoint = process.env.APPCUBE_ADD_PHOTO_URL;
  const accessToken = process.env.APPCUBE_ACCESS_TOKEN;

  if (!endpoint || !accessToken) {
    res.status(500).json({ error: 'Server configuration is incomplete.' });
    return;
  }

  try {
    const upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
          "access-token": accessToken,
      },
      body: JSON.stringify({
        guestName,
        message,
        photoId,
        base64String,
      }),
    });

    const forwarded = await buildForwardedResponse(upstreamResponse);
    res.status(forwarded.status).type(forwarded.contentType).send(forwarded.body);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Unable to reach AppCube.',
    });
  }
});

app.post('/api/guest-submissions', upload.array('photos', 12), async (req, res, next) => {
  try {
    const name = `${req.body?.name || ''}`.trim();
    const message = `${req.body?.message || ''}`.trim();
    const files = req.files ?? [];

    if (!name || !message || !Array.isArray(files) || files.length === 0) {
      if (Array.isArray(files)) {
        await removeFiles(files.map((file) => file.path));
      }

      res.status(400).json({ error: 'Name, message, and at least one photo are required.' });
      return;
    }

    const existing = await readSubmissions();
    const record = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      name,
      message,
      photos: files.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      })),
    };

    existing.push(record);
    await fsp.writeFile(submissionsFile, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use(async (error, req, res, _next) => {
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  if (uploadedFiles.length > 0) {
    await removeFiles(uploadedFiles.map((file) => file.path));
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Each photo must be 10MB or smaller before upload.' });
      return;
    }

    res.status(400).json({ error: error.message });
    return;
  }

  res.status(400).json({ error: error instanceof Error ? error.message : 'Upload failed.' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Wedding upload server listening on http://localhost:${port}`);
});

async function buildForwardedResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return {
      status: response.status,
      contentType: 'application/json; charset=utf-8',
      body: 'null',
    };
  }

  try {
    const parsed = JSON.parse(rawText);
    return {
      status: response.status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(parsed),
    };
  } catch {
    return {
      status: response.status,
      contentType: 'text/plain; charset=utf-8',
      body: rawText,
    };
  }
}

async function ensureStorage() {
  await fsp.mkdir(uploadsDir, { recursive: true });
  await fsp.mkdir(dataDir, { recursive: true });

  try {
    await fsp.access(submissionsFile);
  } catch {
    await fsp.writeFile(submissionsFile, '[]\n', 'utf8');
  }
}

async function readSubmissions() {
  const raw = await fsp.readFile(submissionsFile, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function removeFiles(filePaths) {
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await fsp.unlink(filePath);
      } catch {
        // Ignore cleanup failures so the API can still respond.
      }
    }),
  );
}

function sanitizeSegment(value) {
  return `${value}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'guest';
}
