const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = 3000;

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fsSync.existsSync(dataDir)) {
    fsSync.mkdirSync(dataDir);
    console.log('Created "data" directory');
}
if (!fsSync.existsSync(uploadsDir)) {
    fsSync.mkdirSync(uploadsDir);
    console.log('Created "uploads" directory');
}

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const USERS_FILE = path.join(dataDir, 'users.json');
const PLAYLISTS_FILE = path.join(dataDir, 'playlists.json');

// --- Helper Functions ---
async function readJSON(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function writeJSON(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// --- Auth Routes ---

app.post('/api/register', async (req, res) => {
    try {
        console.log("Register request received:", req.body); // לוג לבדיקה

        const { username, password, firstName, imageUrl } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Missing fields" });
        }

        const users = await readJSON(USERS_FILE);

        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ error: "Username already exists" });
        }

        const newUser = { username, password, firstName, imageUrl };
        users.push(newUser);

        await writeJSON(USERS_FILE, users);
        console.log("User saved successfully");

        res.json({ success: true });
    } catch (error) {
        console.error("Error in /api/register:", error); // הדפסת השגיאה האמיתית לטרמינל
        res.status(500).json({ error: "Internal Server Error: " + error.message });
    }
});

// התחברות
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readJSON(USERS_FILE);

        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

        if (user) {
            const { password, ...userWithoutPass } = user;
            res.json({ success: true, user: userWithoutPass });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (error) {
        console.error("Error in /api/login:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- Playlist Routes ---

app.get('/api/playlists/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const allPlaylists = await readJSON(PLAYLISTS_FILE);
        const userEntry = allPlaylists.find(entry => entry.username === username);
        res.json(userEntry ? userEntry.playlists : []);
    } catch (error) {
        console.error("Error getting playlists:", error);
        res.json([]);
    }
});

app.post('/api/playlists', async (req, res) => {
    try {
        const { username, playlists } = req.body;
        let allPlaylists = await readJSON(PLAYLISTS_FILE);

        const index = allPlaylists.findIndex(entry => entry.username === username);

        if (index !== -1) {
            allPlaylists[index].playlists = playlists;
        } else {
            allPlaylists.push({ username, playlists });
        }

        await writeJSON(PLAYLISTS_FILE, allPlaylists);
        res.json({ success: true });
    } catch (error) {
        console.error("Error saving playlists:", error);
        res.status(500).json({ error: "Failed to save" });
    }
});

// --- MP3 Upload Route ---
app.post('/api/upload', upload.single('mp3file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({
        filePath: '/uploads/' + req.file.filename,
        originalName: req.file.originalname
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});