const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { v4: uuidv4 } = require("uuid");

ffmpeg.setFfmpegPath(ffmpegPath);

const PRIVATE_ROOT = path.resolve(process.env.VIDEO_STORAGE_PATH || path.join(__dirname, "../private-videos"));
const TEMP_ROOT = path.join(PRIVATE_ROOT, "tmp");
const VIDEO_ROOT = path.join(PRIVATE_ROOT, "hls");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
ensureDir(TEMP_ROOT);
ensureDir(VIDEO_ROOT);

function safeVideoId() {
  return uuidv4();
}

function videoDir(videoId) {
  return path.join(VIDEO_ROOT, videoId);
}

function keyPath(videoId) {
  return path.join(videoDir(videoId), "enc.key");
}

function validateVideoId(videoId) {
  return /^[0-9a-f-]{36}$/i.test(videoId);
}

async function processVideo(inputPath, options = {}) {
  const videoId = safeVideoId();
  const outDir = videoDir(videoId);
  ensureDir(outDir);

  const key = crypto.randomBytes(16);
  fs.writeFileSync(keyPath(videoId), key, { mode: 0o600 });

  const keyInfoPath = path.join(outDir, "keyinfo");
  // The URI is rewritten by the protected media-playlist endpoint; the local
  // key path is used only by ffmpeg while producing encrypted HLS.
  fs.writeFileSync(
    keyInfoPath,
    `enc.key\n${keyPath(videoId)}\n`,
    { mode: 0o600 }
  );

  const output = path.join(outDir, "media.m3u8");

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions([
          "-preset", process.env.FFMPEG_PRESET || "veryfast",
          "-crf", process.env.FFMPEG_CRF || "23",
          "-profile:v", "main",
          "-level", "4.0",
          "-pix_fmt", "yuv420p",
          "-vf", "scale=w='min(1280,iw)':h='-2'",
          "-maxrate", "2800k",
          "-bufsize", "5600k",
          "-g", "48",
          "-keyint_min", "48",
          "-sc_threshold", "0",
          "-hls_time", "6",
          "-hls_playlist_type", "vod",
          "-hls_flags", "independent_segments",
          "-hls_segment_filename", path.join(outDir, "segment_%05d.ts"),
          "-hls_key_info_file", keyInfoPath,
          "-movflags", "+faststart",
        ])
        .output(output)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const master = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=3200000,AVERAGE-BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
media.m3u8
`;
    fs.writeFileSync(path.join(outDir, "master.m3u8"), master);

    // Remove the ffmpeg-only key info file. Keep the encryption key private.
    fs.rmSync(keyInfoPath, { force: true });
    fs.rmSync(inputPath, { force: true });

    return {
      videoId,
      duration: options.duration || "",
      storage: "hls-aes128",
      directory: outDir,
    };
  } catch (error) {
    fs.rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
}

function cleanupTempFile(filePath) {
  if (filePath) fs.rmSync(filePath, { force: true });
}

module.exports = {
  PRIVATE_ROOT,
  TEMP_ROOT,
  VIDEO_ROOT,
  videoDir,
  keyPath,
  validateVideoId,
  processVideo,
  cleanupTempFile,
};
