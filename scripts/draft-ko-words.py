"""Offline vocabulary draft for the separate English/Korean review index."""
from pathlib import Path
import os, re, json, time
import ctranslate2
import sentencepiece as spm

model=Path(os.environ['TEMP'])/'pubg-i18n-model'
sp=spm.SentencePieceProcessor(model_file=str(model/'sentencepiece.bpe.model'))
translator=ctranslate2.Translator(str(model),device='cpu',compute_type='int8',intra_threads=2)
audit=json.loads(Path('translation-audit.json').read_text(encoding='utf-8'))
sources=[row['source'] for row in audit]
sources += [line.split(' ⟐ ')[0] for line in Path('locales/site.txt').read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')]
words=sorted(set(word.lower() for word in re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)?",' '.join(sources))))
path=Path('locales/ko-words.json')
translations=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
preserved={'pubg','krafton','discord','cloudflare','render','neon','github','red13','rapture','sergei','kalimnick','shneefuchs','schneefuchs','shroud','wackyjacky','tg ltn','tgltn','kakao','steam','xbox','psn','bp','gc','gcoin','wasd','mp','ump','akm','smg','smgs','dbs','slr','sks','aw m','awm','uzi','vss','pve','pvp','pbc','oauth','csrf','https','http','com','gg','png','svg','id','ids'}
for word in words:
    if word in preserved: translations[word]=word.upper() if word in {'pubg','bp','gc','wasd','ump','akm','smg','smgs','dbs','slr','sks','awm','uzi','vss','pve','pvp','id','ids','psn'} else word
pending=[word for word in words if word not in translations or '\u2047' in translations[word] or '<unk>' in translations[word]]
started=time.monotonic()
for offset in range(0,len(pending),32):
    batch=pending[offset:offset+32]
    inputs=[sp.encode(word,out_type=str)+['</s>','eng_Latn'] for word in batch]
    results=translator.translate_batch(inputs,target_prefix=[['kor_Hang']]*len(batch),beam_size=2,disable_unk=True,max_decoding_length=48,repetition_penalty=1.1,no_repeat_ngram_size=4)
    for word,result in zip(batch,results):
        tokens=result.hypotheses[0]
        translations[word]=sp.decode(tokens[1:] if tokens and tokens[0]=='kor_Hang' else tokens).strip()
    path.write_text(json.dumps(translations,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Korean vocabulary: {min(offset+32,len(pending))}/{len(pending)} ({time.monotonic()-started:.0f}s)',flush=True)
