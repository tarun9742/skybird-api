const fs = require("fs");
const { verifyPlaybackToken, getProtectedFile, setPrivateHeaders, keyPath } = require("../services/playbackService");
const { videoDir, validateVideoId } = require("../services/videoService");

function authorize(req, videoId) {
  return verifyPlaybackToken(req, videoId);
}

exports.getMasterPlaylist = async (req, res) => {
  const { videoId } = req.params;
  if (!validateVideoId(videoId)) return res.status(404).json({ success: false, message: "Video not found" });
  const auth = authorize(req, videoId);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  const masterPath = getProtectedFile(videoId, "master.m3u8");
  if (!masterPath) return res.status(404).json({ success: false, message: "Video not found" });

  const token = req.query.token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const content = fs.readFileSync(masterPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line === "media.m3u8" ? `media.m3u8?token=${encodeURIComponent(token)}` : line)
    .join("\n");

  setPrivateHeaders(res, "application/vnd.apple.mpegurl");
  res.send(content);
};

exports.getMediaPlaylist = async (req, res) => {
  const { videoId } = req.params;
  const auth = authorize(req, videoId);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  const playlistPath = getProtectedFile(videoId, "media.m3u8");
  if (!playlistPath) return res.status(404).json({ success: false, message: "Video playlist not found" });

  const token = req.query.token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const tokenParam = `token=${encodeURIComponent(token)}`;
  let content = fs.readFileSync(playlistPath, "utf8");

  content = content
    .replace(/URI="enc\.key"/g, `URI="/api/videos/${videoId}/key?${tokenParam}"`)
    .split(/\r?\n/)
    .map((line) => {
      if (/^segment_\d+\.ts$/i.test(line.trim())) {
        return `/api/videos/${videoId}/${line.trim()}?${tokenParam}`;
      }
      return line;
    })
    .join("\n");

  setPrivateHeaders(res, "application/vnd.apple.mpegurl");
  res.send(content);
};

exports.getSegment = async (req, res) => {
  const { videoId, filename } = req.params;
  const auth = authorize(req, videoId);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  const filePath = getProtectedFile(videoId, filename);
  if (!filePath || !/\.ts$/i.test(filename)) {
    return res.status(404).json({ success: false, message: "Segment not found" });
  }

  setPrivateHeaders(res, "video/mp2t");
  fs.createReadStream(filePath).pipe(res);
};

exports.getKey = async (req, res) => {
  const { videoId } = req.params;
  const auth = authorize(req, videoId);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  const filePath = keyPath(videoId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: "Encryption key not found" });

  setPrivateHeaders(res, "application/octet-stream");
  res.set("Content-Length", fs.statSync(filePath).size);
  fs.createReadStream(filePath).pipe(res);
};
