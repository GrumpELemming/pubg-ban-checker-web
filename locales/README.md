# Site translations

Every HTML page loads the shared catalogue, language selector, and translation runtime. The runtime translates authored DOM text and accessibility attributes without replacing surrounding markup. Canvas games use `pbcCanvasText`. Player names, clan names, account identifiers, stored status codes, URLs, and literal keyboard inputs remain data.

`site.txt` contains authored translations in the column order shown on its first line. `ko.json` contains additional Korean wording. These take precedence over the initial drafts in `generated.json`. The Korean status wording supplied by the user is preserved in `site.txt`.

To change a phrase, edit its entry and run:

```text
npm run build:i18n
npm run check:i18n
```

The source inventory includes static page text, metadata, accessibility labels, dynamically generated messages, canvas text, and the Hangman word list. Internal identifiers and asset filenames are recorded separately in `exemptions.json`; they are not translated UI phrases. The checker rejects missing languages, altered placeholders, unknown character tokens, and uncatalogued source phrases.

New longer translations in `generated.json` were drafted locally with an NLLB translation model using CTranslate2. They require native-speaker review, particularly game dialogue and legal/privacy wording. Generation has no runtime network or Python dependency; the deployed site uses the committed catalogue. Original model: [Meta NLLB-200](https://huggingface.co/facebook/nllb-200-distilled-600M). Inference instructions: [CTranslate2](https://opennmt.net/CTranslate2/guides/transformers.html).

`docs/korean-translation-review.xlsx` pairs each catalogue phrase with the Korean wording actually shipped. Its Words tab is a separate vocabulary index; standalone meanings can differ from meanings in a sentence. Both tabs provide correction and notes columns. UTF-8 CSV copies are included for other spreadsheet applications.

Regenerate the workbook with `scripts/review-ko.py` in a Python environment containing openpyxl, after building the catalogue. The optional draft-generation scripts also require a local translation model, sentencepiece, and CTranslate2. Model weights and Python environments are kept outside the repository.

Welsh (`cy`, Cymraeg) is maintained in `cy.json` and merged by the catalogue builder. Initial Welsh wording was machine translated from the English catalogue with Google Translate and requires Welsh-speaker review. Keep numbered placeholders unchanged.
