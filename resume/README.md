# Résumé source

`ryan-strawbridge-resume.tex` is the source for `public/resume.pdf` — the file
the "Résumé (PDF)" button on the home page links to. Edit the `.tex`, rebuild,
and copy the PDF into `public/`.

Template originally by Vishhal Shashi Kumar.

## Building

The repo has no TeX engine bundled. Either:

**Overleaf** — upload the `.tex` and compile there (pdfLaTeX). Simplest if you
don't want a local install.

**Locally with Tectonic** — a single self-contained binary, unlike MacTeX's
several GB:

```bash
brew install tectonic          # or download the binary from the releases page
cd resume
tectonic ryan-strawbridge-resume.tex
cp ryan-strawbridge-resume.pdf ../public/resume.pdf
```

The `\pdfgentounicode` lines are guarded with `\ifdefined`, so the same file
compiles under pdfLaTeX (Overleaf) and XeTeX (Tectonic). Under pdfLaTeX you
also get the ATS-friendly glyph mapping.

## Keeping it to one page

The spacing block near the top is the only part you should need to touch:

| Length | Current | What it controls |
|---|---|---|
| `\sectiongap` | 8pt | space above each section title |
| `\afterrulegap` | 3pt | space below the section rule |
| `\entrygap` | 4pt | space between jobs / entries |
| `\bulletgap` | 1pt | space between bullets in one entry |
| `\headgap` | 2pt | heading block to its bullets |

At the template's original 9pt/5pt this content ran to two pages; 8pt/4pt fits
it on one. If you add a bullet and it spills again, drop `\sectiongap` and
`\entrygap` by 1pt at a time before touching anything else.
