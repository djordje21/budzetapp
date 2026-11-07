# Budžet

Kućni budžet za dvoje: **plan** (očekivani prihodi, troškovi, štednja) i **stvarna potrošnja** koja se unosi dnevno, uz poređenje plana i stvarnog stanja.

Aplikacija je statična (HTML + CSS + JavaScript, bez build koraka) i radi na GitHub Pages. Na telefonu: otvori link → Share → *Add to Home Screen* i radi kao aplikacija.

## Struktura

```
index.html              ljuska aplikacije
css/app.css             izgled (svetla/tamna tema)
js/app.js               navigacija, izbor meseca
js/store.js             podaci (sada localStorage, sledeće Supabase)
js/calc.js              proračuni plan vs. stvarno
js/ui.js                paneli, obaveštenja, animacije
js/views/*.js           ekrani: pregled, plan, istorija, unos, više
supabase/schema.sql     šema baze za zajednički rad
```

## Lokalno pokretanje

```bash
python3 -m http.server 8000
```

pa otvori http://localhost:8000. Fajl ne radi kad se otvori direktno sa diska (`file://`) jer koristi JavaScript module.

## Plan razvoja

1. ✅ Nova osnova: plan + stvarni unosi, novi UI, ispravke grešaka, uvoz starog backupa
2. Zajednički rad preko Supabase (login, sinhronizacija u realnom vremenu)
3. Izveštaji: dan, nedelja, mesec, kvartal, polugodište, godina
4. Saveti, poruke i animacije
5. Dorada i offline rad

## Privatnost

Repo je javan, pa se u kodu **ne nalaze** lični iznosi. Podaci se čuvaju u browseru, a posle koraka 2 u Supabase bazi zaštićenoj loginom i Row Level Security pravilima.
