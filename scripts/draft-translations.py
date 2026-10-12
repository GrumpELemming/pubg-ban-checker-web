"""Optional offline NLLB draft generator. Authored site.txt translations take precedence."""
from pathlib import Path
import os, json, re, time, html, unicodedata
import ctranslate2
import sentencepiece as spm

model = Path(os.environ['TEMP']) / 'pubg-i18n-model'
tokenizer = spm.SentencePieceProcessor(model_file=str(model / 'sentencepiece.bpe.model'))
translator = ctranslate2.Translator(str(model), device='cpu', compute_type='int8', inter_threads=1, intra_threads=6)
languages = {'ko':'kor_Hang', 'zh':'zho_Hans', 'de':'deu_Latn', 'fi':'fin_Latn', 'pl':'pol_Latn', 'ru':'rus_Cyrl', 'tr':'tur_Latn', 'hy':'hye_Armn', 'ar':'arb_Arab'}
authored = {}
for line in Path('locales/site.txt').read_text(encoding='utf-8').splitlines():
    if not line or line.startswith('#'): continue
    columns = line.split(' ⟐ ')
    authored[columns[0]] = dict(zip(['en', *languages], columns))

preserved = {'PUBG','Steam','Xbox','PSN','Kakao','Discord','Cloudflare','Render','Neon','GitHub Pages','PUBG Lookup','PUBGLookup','PUBG Meta','PUBG.SH','Chicken Dinner GG','Shady Knights','Red13','Rapture','Sergei Kalimnick','Pillar','GCoin','G-Coin','BP','GC','BCD','WASD','G','R','B','F','M','J','P','UMP','MP9','Vector','P90','BIZON','DBS','MICRO UZI','BERYL','FAMAS','SKORPION','MIRAMAR','ERANGEL','SANHOK','VIKENDI','TAEGO','DESTON','HAVEN','PARAMO','RONDO','SOSNOVKA','DOBRO MESTO','EL AZAHAR','HACIENDA DEL PATRON','LOS LEONES','LIPOVKA','MYLTA POWER','MOSIN NAGANT','WINCHESTER','LYNX AMR','PANZERFAUST'}
technical = {'QWERTYUIOP','ASDFGHJKL','ZXCVBNM','BebasNeue,system-ui','AbortError','NumpadEnter','neutral','error','success','warning','available','signed-in','offline','temp','perm','not','ok','unavailable','OldName → NewName','identify','Secure','HttpOnly','pbc_oauth_state','pbc_oauth_next','pbc_session','pbc_csrf','Special loot chances must be nonnegative and total at most 1'}
audit = json.loads(Path('translation-audit.json').read_text(encoding='utf-8'))
sources = []; exemptions = []
for row in audit:
    source = html.unescape(row['source'])
    if source in technical or re.search(r'\.(png|svg|jpg|webp)$|^(hero\.|results\.|watchlist\.)', source):
        exemptions.append({**row, 'reason':'Internal code, asset filename, or non-user-facing token'}); continue
    if source not in sources: sources.append(source)

output_path = Path('locales/generated.json')
output = json.loads(output_path.read_text(encoding='utf-8')) if output_path.exists() else {}
output = {source: values for source, values in output.items() if source in sources}
for source in sources:
    output.setdefault(source, {'en':source})
    if source in preserved or re.match(r'^[\w.-]+\.(?:com|gg|sh|org)$', source):
        output[source].update({lang:source for lang in languages})
    if source in authored: output[source].update(authored[source])
    if source not in authored and source not in preserved:
        for lang in languages:
            value=output[source].get(lang,'')
            if '\u2047' in value or '<unk>' in value:
                output[source].pop(lang,None)
            elif source.isupper() and re.search(r'[A-Z]',source) and value.casefold()==source.casefold():
                output[source].pop(lang,None)
Path('locales/exemptions.json').write_text(json.dumps(exemptions, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def save():
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def prepare(text):
    text=text.translate(str.maketrans({'—':' - ', '–':' - ', '→':' to ', '←':'', '’':"'", '“':'"', '”':'"', '…':'...', '·':' - ', '\u00a0':' '}))
    text=''.join(ch for ch in text if unicodedata.category(ch) not in {'So','Cs'})
    text=re.sub(r'\s+',' ',text).strip()
    if text.isupper(): text=text.capitalize()
    return text

for lang, token in languages.items():
    pending = [s for s in sources if not output[s].get(lang)]
    pieces = {}
    for source in pending:
        for segment in re.split(r'(\{\d+\})', source):
            if segment.strip() and not re.fullmatch(r'\{\d+\}', segment):
                pieces.setdefault(segment.strip(), None)
    queue = list(pieces); started = time.monotonic()
    print(f'{lang}: translating {len(pending)} phrases, {len(queue)} segments', flush=True)
    for offset in range(0, len(queue), 16):
        batch = queue[offset:offset+16]
        inputs = [tokenizer.encode(prepare(text), out_type=str)+['</s>', 'eng_Latn'] for text in batch]
        results = translator.translate_batch(inputs, target_prefix=[[token]]*len(batch), beam_size=2, disable_unk=True, max_decoding_length=256, max_input_length=512, repetition_penalty=1.1, no_repeat_ngram_size=5)
        for text, result in zip(batch, results):
            tokens = result.hypotheses[0]
            if tokens and tokens[0] == token: tokens = tokens[1:]
            pieces[text] = tokenizer.decode(tokens).strip()
        for source in pending:
            parts = re.split(r'(\{\d+\})', source)
            if all(not p.strip() or re.fullmatch(r'\{\d+\}', p) or pieces.get(p.strip()) for p in parts):
                output[source][lang] = ''.join(p if re.fullmatch(r'\{\d+\}', p) or not p.strip() else (' ' if p.startswith(' ') else '')+pieces[p.strip()]+(' ' if p.endswith(' ') else '') for p in parts)
        save()
        print(f'{lang}: {min(offset+16,len(queue))}/{len(queue)} segments ({time.monotonic()-started:.0f}s)', flush=True)
    save()
print('All translation drafts saved.', flush=True)
