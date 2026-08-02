# DevSpace — Personal Website

A personal web dev playground and portfolio starter. Open `index.html` to see the site, or head straight to `sandbox/index.html` for the live code editor.

## Project Structure

```
personal-website/
├── index.html          ← Main portfolio/landing page
├── css/
│   ├── style.css       ← Main site styles
│   └── sandbox.css     ← Sandbox editor styles
├── js/
│   └── main.js         ← Site-wide JavaScript
└── sandbox/
    ├── index.html      ← Live code playground
    └── sandbox.js      ← Playground engine
```


## Quick Start
Just open `index.html` in a browser (no build step needed).
Or run a local dev server for a smoother experience:

```bash
# Python (built-in)
python -m http.server 5500

# Node.js (npx)
npx serve .
```

Then visit `http://localhost:5500`

## Personalizing
| What to edit | Where |
|---|---|
| Your name / bio | `index.html` → `#about` section |
| Skills & levels | `index.html` → `#skills` section |
| Add a project card | `index.html` → `#projects` section |
| Site colors / fonts | `css/style.css` → `:root` tokens |
| Custom JS behavior | `js/main.js` |
