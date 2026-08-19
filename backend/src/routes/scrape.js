import { Router } from 'express';
import { scrape, scrapeRecursive } from '../services/scraper.js';
import ScrapeHistory from '../models/ScrapeHistory.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { url, mode = 'article', recursive = false, maxDepth = 1, maxPages = 10 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const validModes = ['article', 'text', 'links', 'images', 'metadata', 'pdf', 'full'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: `Invalid mode. Valid modes: ${validModes.join(', ')}` });
    }

    let result;
    if (recursive && mode === 'full') {
      result = await scrapeRecursive(url, maxDepth, maxPages);
    } else {
      result = await scrape(url, mode);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Scrape failed' });
  }
});

// Explicitly save a scrape result to the database
router.post('/save', async (req, res, next) => {
  try {
    const { url, mode, title, summary, status, result, error, parentId } = req.body;

    if (!url || !mode) {
      return res.status(400).json({ error: 'url and mode are required' });
    }

    const entry = new ScrapeHistory({
      url,
      mode,
      title: title || null,
      summary: summary || null,
      status: status || 'success',
      result: result || null,
      error: error || null,
      parentId: parentId || null,
      saved: true,
    });
    await entry.save();

    res.json({
      success: true,
      id: entry._id,
      entry: {
        _id: entry._id,
        url: entry.url,
        mode: entry.mode,
        title: entry.title,
        summary: entry.summary,
        status: entry.status,
        parentId: entry.parentId,
        saved: entry.saved,
        createdAt: entry.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Attach a child scrape to a parent
router.post('/attach', async (req, res, next) => {
  try {
    const { childId, parentId } = req.body;

    if (!childId || !parentId) {
      return res.status(400).json({ error: 'childId and parentId are required' });
    }

    const parent = await ScrapeHistory.findById(parentId);
    if (!parent) {
      return res.status(404).json({ error: 'Parent record not found' });
    }

    const child = await ScrapeHistory.findByIdAndUpdate(
      childId,
      { parentId },
      { new: true }
    );
    if (!child) {
      return res.status(404).json({ error: 'Child record not found' });
    }

    res.json({ success: true, childId, parentId });
  } catch (err) {
    next(err);
  }
});

// Get all children of a parent
router.get('/children/:parentId', async (req, res, next) => {
  try {
    const children = await ScrapeHistory.find({ parentId: req.params.parentId })
      .sort({ createdAt: -1 })
      .select('-result')
      .lean();

    res.json({ children, count: children.length });
  } catch (err) {
    next(err);
  }
});

export default router;
