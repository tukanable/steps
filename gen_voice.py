#!/usr/bin/env python3
"""Генерация озвучки ElevenLabs с таймстемпами. Ключ берётся из ../instagen/.env."""
import json, base64, os, urllib.request, urllib.error

def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

env = load_env(os.path.join(os.path.dirname(__file__), '..', 'instagen', '.env'))
API_KEY = env['ELEVENLABS_API_KEY']
VOICE_ID = '87ifZMBSxa6PWYnKMWiH'   # голос указан пользователем
MODEL = 'eleven_v3'                 # v3 понимает теги эмоций [..] и <break/>

# Теги [..] и паузы <break/> управляют подачей и вырезаются из субтитров.
# Субтитры/тайминги строятся по чистым фразам (ниже, в build_timeline).
NARRATION = (
    "[curious] Тысяча путников идут к своей цели. <break time=\"0.3s\" /> "
    "[thoughtful] Давайте их ускорим — увеличим шаг. <break time=\"0.3s\" /> "
    "[emphatic] Каждый путник перескакивает цель, потому что шаг слишком большой. <break time=\"0.3s\" /> "
    "[slightly frustrated] Каждый из них пытается дойти до цели, но не может. <break time=\"0.3s\" /> "
    "[building intensity] Чем больше шаги делает путник, тем больше получается разброс. <break time=\"0.4s\" /> "
    "[dramatic] Можно настолько большими шагами двигаться, что просто вылетаешь в бесконечность от намеченной цели."
)
FIASCO = "[sarcastic] Это фиаско, братан."

def tts(text, mp3_path, align_path=None):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/with-timestamps"
    body = json.dumps({
        "text": text,
        "model_id": MODEL,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
    }).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:500])
        raise
    with open(mp3_path, 'wb') as f:
        f.write(base64.b64decode(data['audio_base64']))
    al = data.get('alignment') or {}
    dur = (al.get('character_end_times_seconds') or [0])[-1]
    print(f"  -> {os.path.basename(mp3_path)}  dur~{dur:.2f}s  chars={len(al.get('characters', []))}")
    if align_path and al:
        with open(align_path, 'w') as f:
            json.dump({
                "text": text,
                "characters": al["characters"],
                "start": al["character_start_times_seconds"],
                "end": al["character_end_times_seconds"],
            }, f, ensure_ascii=False)
    return dur

here = os.path.dirname(__file__)
print("narration...")
tts(NARRATION, os.path.join(here, 'narration.mp3'), os.path.join(here, 'narration.align.json'))

# --- пересобрать timeline.js под свежие тайминги ---
def build_timeline():
    d = json.load(open(os.path.join(here, 'narration.align.json')))
    txt = ''.join(d['characters']); st = d['start']; end = d['end'][-1]
    def t(sub):
        i = txt.find(sub); return round(st[i], 3) if i >= 0 else None
    anchors = {
        'uvelichim': t('увеличим'),
        'pereskakivaet': t('перескакивает'),
        'ne_mozhet': t('но не может'),
        'razbros': t('разброс'),
        'beskonechnost': t('бесконечность'),
    }
    sents = [
        ('Тысяча путников идут к своей цели.', 'Тысяча'),
        ('Давайте их ускорим — увеличим шаг.', 'Давайте'),
        ('Каждый путник перескакивает цель, потому что шаг слишком большой.', 'Каждый путник'),
        ('Каждый из них пытается дойти до цели, но не может.', 'Каждый из них'),
        ('Чем больше шаги делает путник, тем больше получается разброс.', 'Чем больше'),
        ('Можно настолько большими шагами двигаться, что просто вылетаешь в бесконечность от намеченной цели.', 'Можно настолько'),
    ]
    sentences = [{'t': t(key), 'text': s} for s, key in sents]
    try:
        fd = json.load(open(os.path.join(here, 'fiasco.align.json'))); fdur = round(fd['end'][-1], 3)
    except Exception:
        fdur = 1.44
    out = {'duration': round(end, 3), 'anchors': anchors, 'sentences': sentences, 'fiascoDur': fdur}
    open(os.path.join(here, 'timeline.js'), 'w').write(
        'window.TIMELINE = ' + json.dumps(out, ensure_ascii=False, indent=2) + ';\n')
    print("timeline:", {k: v for k, v in anchors.items()}, "dur", out['duration'])

build_timeline()
print("done")
