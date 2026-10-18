# Mobile: passaggio a Claude — 18 ottobre 2026

Checkout `ios`, base `26833fe`. Nessun commit, push o installazione sul telefono.
L'ultima istruzione di Jacopo restringe il lavoro di Codex a codice e verifiche
automatiche: simulatore, QA visiva e review finale spettano a Claude.

## Interventi di Codex

1. **Tocchi e navigazione.** I callback dei contesti `useChoice` e `useTextPrompt`
   sono stabili: apertura, chiusura e digitazione in una sheet non notificano
   nuovamente tutti i consumer dei contesti. La sheet mantiene il contenuto durante
   la dissolvenza nativa, e la successiva azione attende la chiusura effettiva su
   iOS; Android usa il completamento della dissolvenza. Zoom iOS, animazioni delle
   liste, ricerca, struttura Home/Notes/Comments e scroll non sono stati sostituiti.
   `NotePreview.tsx` non copia più l'intero array del documento e ferma la visita
   una volta raggiunto il limite di 40 blocchi; anche liste e citazioni sono
   limitate. La memoizzazione evita di ricostruire preview identici quando i
   collaboratori mostrati non cambiano. Nel benchmark sintetico Node, 10.000
   paragrafi passano da 20.000 a 41 letture dell'array (mediana su 9 esecuzioni:
   2,320 → 0,026 ms). Il confine React/native è simulato: questi numeri non sono
   tempi di apertura o FPS del telefono. Vedere `preview-benchmark.json` e relativo
   script nei log. Non considerare i lag su dispositivo definitivamente risolti.
2. **Superfici applicative.** `TextPrompt.tsx` offre la stessa sheet a entrambi i
   sistemi: titolo, chiusura esplicita, icone, descrizioni facoltative, scorrimento,
   accenti distruttivi e target di almeno 44 pt. Nomi e link usano un prompt
   applicativo coerente con tastiera e pulsanti accessibili. Il + Home e il menu
   della cartella in `NoteList.tsx` usano queste superfici. Picker di file, prompt
   di permesso e contesto/zoom nativo delle note restano del sistema.
3. **Book dopo login.** `session.ts` legge `archives.kind` e accetta `notesOnly`.
   Il mobile lo passa ad autenticazione, scelta archivio, ripresa di un account e
   ripristino iniziale. Gli archivi normali condivisi restano disponibili. Solo
   Book o nessun archivio portano al chooser vuoto con creazione esplicita di un
   archivio Notes. Il telefono non sceglie un Book come ripiego. I chiamanti
   desktop non impostano il filtro e il loro helper di switch con reload resta
   invariato.
4. **Account e Settings.** La pagina Accounts mostra identità corrente, account
   salvati, Add Account e Sign Out of This Account; rimosso il doppio logout
   dall'indice. `pauseAccount` conserva token, mai password, senza chiamare il
   logout Supabase che revocherebbe il refresh token. `resumeAccount` restituisce
   una sessione verificata senza reload; recupera un archivio Notes disponibile se
   quello ricordato è un Book o non è più accessibile. Il cambio aspetta scritture
   di metadati e preferenze, smonta provider/editor/canali e svuota cache immagini
   private e preferenze live. Le letture e gli eventi preferenze tardivi sono
   invalidati da una generazione. Un flush rifiutato impedisce di lasciare
   l'account. Dopo errore di switch si tenta il recupero dell'identità precedente;
   il logout dimentica solo l'account corrente.
5. **Icona mobile.** `apps/mobile/assets` contiene SVG originali carta/inchiostro
   e PNG 1024 px: icona generale/iOS RGB opaca, foreground adattivo Android e
   monocromatica con trasparenza. `app.config.ts` usa solo questi asset; nessun
   asset desktop modificato. Prima dell'ultima restrizione è stata prodotta la
   tavola `/private/tmp/napp-mobile-final-qa/icon-sizes.png` a 24–180 px. Non è uno
   screenshot del simulatore né prova di come il launcher applica la maschera.

File principali: `apps/mobile/src/{Accounts,Avatar,TextPrompt,NoteList,NotePreview,SettingsControls,SignIn,archive}.tsx`,
`apps/mobile/src/app/_layout.tsx`, pagine Settings, il + in `app/(tabs)/index.tsx`,
`packages/core/src/lib/{session,accountPreferences}.ts` e rispettivi test,
`preview/{session,accountPreferences}.mock.ts`, `apps/mobile/app.config.ts`,
`apps/mobile/assets`, sezioni mobile di `CLAUDE.md`.

Il login carta/inchiostro approvato è stato mantenuto: modificata la logica di
chooser/sessione, aggiunti stato vuoto e ritorno agli account salvati. Nessun
ripristino della N blu o del vecchio form.

## Concorrenza: preservare il lavoro di Claude

Durante questo intervento sono apparse modifiche concorrenti in editor HTML/TS,
`HostedPage.tsx`, `NoteComments.tsx`, `WhoseSwitch.tsx`, `app/note/[id].tsx`,
`icons.tsx`, `WritingBar.tsx`, componenti editor core, commenti, bridge hosted,
presence e documentazione. Non sono state ripristinate.

Sovrapposizioni effettive:

- `app/(tabs)/index.tsx`: Codex ha cambiato solo il contenuto del + (`Create`,
  descrizioni e icone); le nuove transizioni `Turning` e la struttura di Claude
  sono state conservate.
- `CLAUDE.md`: Codex ha aggiornato le descrizioni di sheet, account, filtro Book,
  ordine Settings e asset mobile; conservate le sezioni concorrenti su transizioni
  e commenti.
- Il rimontaggio di `HostedPageProvider` al cambio account deve essere verificato
  insieme al nuovo bridge/token lifecycle di Claude. Codex non ha riscritto il
  file `HostedPage.tsx`.
- `commentThreads.test.ts` aveva problemi di formattazione durante i controlli;
  Codex non ha formattato il file concorrente.

## Verifiche automatiche

Log in `/private/tmp/napp-mobile-final-qa/`.

- Test sessione mirati: **14/14 passati**, `session-tests.log`.
- Test preferenze mirati: **4/4 passati**, `preferences-tests.log`.
- Ripetizione mirata dopo le ultime modifiche: **18/18 passati**,
  `account-tests-final.log`.
- Suite core completa finale: **252/252 passati**, `tests-final.log`.
- Typecheck completo finale: **passato**, `typecheck-final.log`.
- Typecheck mobile e preview isolati: **passati**,
  `mobile-typecheck-final.log` e `preview-typecheck.log`.
- Build web finale: **passata**, `build-final.log`; warning sui chunk grandi.
- Export Metro/Hermes preview iOS e Android dopo le ultime modifiche: **passati**,
  `export-ios-final.log` e `export-android-final.log`.
- Lint dei file di questo intervento: **0 errori, 8 warning Fast Refresh**,
  `lint-owned-final.log`.
- Prettier di tutti i file di questo intervento: **passato**,
  `format-owned-final.log`.
- `pnpm healthcheck`: **fermato da Prettier** sul file concorrente
  `packages/core/src/lib/commentThreads.test.ts`, `healthcheck.log`.
  Gli stadi successivi sono stati eseguiti separatamente come sopra.
- Lint completo: **4 errori Prettier nello stesso file concorrente**, più
  17 warning, `lint.log`. Nessuna correzione del file di Claude è stata applicata.
- `git diff --check`: **passato** al termine.

Gli export finali sono bundle preview, non build native Release. Le prime prove
avevano trovato un errore di tipo nel mock sessione, poi corretto; i log finali
sopra riportano le verifiche ripetute dopo la correzione.

Questi controlli non dimostrano il corretto comportamento UI su dispositivi o la
rotazione dei refresh token contro un server reale. Nessun dato reale usato per
una prova di scrittura.

## Verifiche e build affidate a Claude

Esercitare su preview: + → New Note/New Folder/Import, ⋯ cartella → rinomina,
chiusura con sfondo/×/back Android, tastiera e screen reader. Controllare zoom,
ritorno da nota, ricerca, scroll e frame durante apertura Settings/cartelle.

Per account: A → Add → B → A, annullare Add e tornare ad A, uscire da B e tornare
ad A, token scaduto, errore di rete, modifica preferenze subito prima di switch,
nessun testo o avatar precedente visibile. Il preview supporta
`second@example.invalid` e `books@example.invalid` con password fittizia per la
UI; i test della logica reale usano confini auth/database isolati.

Dopo review e autorizzazione: rigenerare gli asset nativi da `app.config.ts`
tramite Expo prebuild preservando le eventuali personalizzazioni native locali,
ricostruire l'editor con `NAPP_PREVIEW=0 pnpm --filter @notes-app/mobile editor`,
poi seguire i comandi Release iOS/Android del repository. Verificare che la build
non sia preview, che i nuovi asset siano nei cataloghi nativi e che il bundle
carichi senza Metro. Commit, push e installazione restano fuori da questo
intervento.
