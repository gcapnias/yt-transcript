// clean-transcript.js
import fs from 'node:fs';
import path from 'node:path';

/**
 * Step 1: Strip inline VTT tags (<c>, </c>, <00:00:00.000>) and unescape entities.
 */
function stripInlineTags(rawText) {
  return rawText
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts HH:MM:SS.MS or HH:MM:SS,MS to total seconds.
 */
function parseTimeToSeconds(timestamp) {
  const [time, ms = '0'] = timestamp.replace(',', '.').split('.');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds + parseInt(ms.padEnd(3, '0').slice(0, 3), 10) / 1000;
}

/**
 * Normalizes a word for overlap comparison (lowercase, alphanumeric only).
 */
function normalize(word) {
  return word.toLowerCase().replace(/[^\w]/g, '');
}

/**
 * Step 2: Finds how many leading words in `currWords` duplicate the trailing words in `accumulatedWords`.
 */
function getOverlapSize(accumulatedWords, currWords) {
  const maxCheck = Math.min(accumulatedWords.length, currWords.length);

  for (let k = maxCheck; k > 0; k--) {
    const accTail = accumulatedWords.slice(-k).map(normalize).join(' ');
    const currHead = currWords.slice(0, k).map(normalize).join(' ');

    if (accTail === currHead && accTail.length > 0) {
      return k;
    }
  }

  return 0;
}

export function processTranscript(fileContent, options = {}) {
  const { pauseThresholdSeconds = 2.0 } = options;
  const lines = fileContent.split(/\r?\n/);

  const cues = [];
  let currentCue = null;
  let currentLines = [];

  const timePattern = /(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3})/;

  // STEP 1: Parse cues and IMMEDIATELY strip all inline tags to yield clean text per cue
  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || /^\d+$/.test(line) || line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:')) {
      continue;
    }

    const match = line.match(timePattern);
    if (match) {
      if (currentCue) {
        currentCue.cleanText = stripInlineTags(currentLines.join(' '));
        if (currentCue.cleanText) cues.push(currentCue);
        currentLines = [];
      }
      currentCue = {
        start: parseTimeToSeconds(match[1]),
        end: parseTimeToSeconds(match[2]),
        cleanText: '',
      };
    } else {
      currentLines.push(line);
    }
  }

  if (currentCue) {
    currentCue.cleanText = stripInlineTags(currentLines.join(' '));
    if (currentCue.cleanText) cues.push(currentCue);
  }

  // STEP 2 & 3: Compare cleaned cue texts, remove overlaps, and form paragraphs
  const paragraphs = [];
  let currentParagraphWords = [];
  let lastEndTime = 0;

  for (const cue of cues) {
    const cueWords = cue.cleanText.split(/\s+/).filter(Boolean);
    if (cueWords.length === 0) continue;

    const pauseDuration = cue.start - lastEndTime;

    // Start a new paragraph if speech pause exceeds threshold
    if (pauseDuration >= pauseThresholdSeconds && currentParagraphWords.length > 0) {
      paragraphs.push(currentParagraphWords.join(' '));
      currentParagraphWords = [];
    }

    // Compare clean text word sequences to extract only new content
    const overlapSize = getOverlapSize(currentParagraphWords, cueWords);
    const uniqueWords = cueWords.slice(overlapSize);

    if (uniqueWords.length > 0) {
      currentParagraphWords.push(...uniqueWords);
    }

    lastEndTime = cue.end;
  }

  if (currentParagraphWords.length > 0) {
    paragraphs.push(currentParagraphWords.join(' '));
  }

  return paragraphs.join('\n\n');
}

// CLI Execution
if (process.argv[2]) {
  const inputFilePath = path.resolve(process.argv[2]);
  const rawData = fs.readFileSync(inputFilePath, 'utf-8');
  const cleanedText = processTranscript(rawData);

  const outputPath = inputFilePath.replace(/\.(vtt|srt|txt)$/i, '_transcript.txt');
  fs.writeFileSync(outputPath, cleanedText, 'utf-8');
  console.log(`Cleaned transcript saved to: ${outputPath}`);
}