# Verifiche del 24 ottobre 2026

Questi esiti riguardano il codice in lavorazione sul branch `ios`, versione
0.9.43. Non costituiscono un invio o un'approvazione degli store. Il repository
è condiviso con il lavoro mobile di Claude; nessun reset o sostituzione delle
sue modifiche è stato eseguito.

## Codice e backend

- `pnpm healthcheck`: superato, 276 test, nessun fallimento; replay PostgreSQL
  locale e prove RLS superate; lint senza errori (23 avvisi Fast Refresh).
- Test aggiunto per impedire registrazione senza consenso e verificare i metadati
  di versione/privacy inviati ad Auth. Test client di cancellazione e worker.
- `verify-account-erasure.mjs --remote-fixtures`: superato con account appena
  creati e rimossi. Identità, Storage, avatar, Yjs, versioni e metadati verificati;
  conservazione dei documenti di altri autori e blocco dei vecchi token verificati.
  Una fixture interrotta dopo la preparazione viene completata dal cron remoto
  senza un client. Coda cancellazioni successiva: zero pendenti.
- `verify-store-safety.mjs --remote-fixtures`: superato su account fittizi,
  compresi accesso diretto ai file con richiesta nuova, coda privata, segnalazione
  commenti, blocco/sblocco e impossibilità di falsificare l'autore.
- Migrazioni 20261024010000–20261024060000 e funzione Edge `delete-account`
  applicate al progetto collegato. Test locale della scadenza dei report rivisti
  dopo 90 giorni e della conservazione del filtro confermato: superato.
- Conteggi aggregati sul backend: nessuna nota, cartella o tag senza `owner_id`.
  Nessun contenuto di utenti reali usato come fixture o bersaglio di cancellazione.

## Build

- Web di produzione: compilato dal healthcheck con base `/napp/`.
- Renderer desktop: compilato con endpoint collaborativo pubblico.
- iOS Release per dispositivo generico, senza firma: compilato con Xcode 27.1,
  SDK iphoneos27.1, minimo iOS 16.4. Identificativo `io.github.jacopo792.napp`.
  Il manifest applicativo dichiara i dati del servizio; i manifest inclusi non
  dichiarano tracking. La validazione App Store Connect resta da eseguire.
- Android Release: `assembleRelease` superato, APK locale senza firma, versione
  0.9.43/code 1, compile SDK 37 e target SDK 36. Manifest finale non debuggabile:
  solo Internet, vibrazione e permesso interno del receiver; assenti fotocamera,
  microfono, permessi generali foto/video/storage e overlay.
- `zipalign -c -P 16 -v 4`: superato. Controllati i segmenti ELF delle 27 librerie
  ARM64 incluse: nessuna con allineamento LOAD inferiore a 16 KB. Anche le 27 librerie x86_64 superano il controllo. Questo non
  sostituisce una prova su un dispositivo con pagine 16 KB.
- Nessun marker delle fixture di anteprima nei bundle nativi iOS/Android.
- La richiesta di AAB senza chiave upload è stata rifiutata come previsto prima
  della compilazione. Non è stato generato un bundle store con firma debug.

## Pagine e infrastruttura

Privacy e cancellazione osservate nell'anteprima locale isolata: conseguenze,
contatti, link e campi presenti; pulsante distruttivo disabilitato senza password
più conferma. Lo scorrimento porta ai contatti in fondo alla privacy. Nessuna
richiesta distruttiva inviata dall'interfaccia. Questo controllo non sostituisce
il QA sui dispositivi o il successivo controllo del sito pubblico pubblicato.

Server pubblico `/healthz` e `/readyz`: HTTP 200. Supabase regione `eu-west-1`.
Auth pubblico con autoconferma email attiva: problema ancora da risolvere.
Non verificati contratto e conservazione log/backup dei fornitori, disponibilità
continua, ripristino da backup, gestione continuativa della moderazione.

## Limiti che restano

Account Apple/Google non attivi, dominio e mittente email mancanti, firme e
console non completate. Nessun TestFlight, test chiuso Play, screenshot store o
QA interattivo completo iPhone/iPad/Android concluso in questa attività. Le prove
parziali sono elencate sotto. Nessun nuovo
commit/push/tag o release eseguito: l'obiettivo di preparazione completa resta
aperto in `store-release-readiness.md`.

## Segnalazione nativa e menu Safety

Nel simulatore iOS Release, con due account fittizi, il menu della persona apre
il modulo Report; selezionando Spam e inviando compare la conferma. La coda
privata Supabase contiene il report rivolto alla fixture Partner con la
motivazione scelta. Nessun account reale è stato segnalato.

Il menu Safety usa ora il popover di Napp (`useChoice`), con icone, azione
distruttiva in rosso e chiusura toccando fuori. La conferma del blocco conserva
il testo delle conseguenze. Formattazione, lint mirato e typecheck mobile
superati; build Release del simulatore ricompilata e installata. Verificati il
popover effettivamente mostrato, l'apertura di Report e la conferma del blocco.
Partner compare nell'elenco bloccati dopo Block e scompare dopo Unblock; entrambi
i cambiamenti sono stati verificati anche sul backend. Il filtro sui contenuti
resta coperto dalla prova remota separata, non da questa sola verifica visiva.

Schermata nativa Delete account: conseguenze e account bersaglio visibili,
pulsante disabilitato senza password, abilitato dopo l'inserimento, conferma
separata e annullamento verificati. Nessuna cancellazione inviata dalla UI;
il flusso distruttivo e la password errata sono coperti dai test remoti.
`pnpm healthcheck` nuovamente superato dopo il cambio del menu Safety.

## Aggiornamento: menzioni e simulatori

Il replay PostgreSQL ora riproduce anche i privilegi predefiniti delle nuove
tabelle pubbliche Supabase, senza sovrascrivere le revoche delle migrazioni.
Una regressione riproduceva la cancellazione bloccata da una vecchia menzione
fra altre due persone poi bloccatesi. La migrazione `20261024060000` permette
la pulizia amministrativa e mantiene il divieto per i client autenticati.
La prova locale e quella remota completa, con questa nuova fixture, sono
passate; è stata verificata anche la ripresa automatica dal cron.

La build Release per iOS Simulator è compilata e installata su un nuovo
simulatore “Napp Store QA”, separato dai dispositivi esistenti. Apertura,
schermata di accesso e registrazione osservate: link legali presenti, checkbox
di consenso presente, creazione account disabilitata prima del consenso.
La copia Android per il QA è firmata localmente con chiave debug e installata
su un emulatore nuovo; l'APK originale per verifica resta senza firma. Nessuna
chiave di debug è prevista per il bundle destinato a Play.

Accesso iOS con fixture: riuscito; nell'archivio sono visibili note e membro
condiviso. Il percorso di registrazione mostra correttamente i link legali e
la creazione disabilitata prima del consenso. La navigazione completa non è
ancora verificata: Device Hub espone solo alcuni controlli AX e le azioni
coordinate del driver restituiscono `noWindowsAvailable`; anche una conferma
di Safari è visibile nell'immagine ma non espone pulsanti al driver.

Per ripetere la prova manuale, `node scripts/store-ui-fixtures.mjs --create`
crea solo due account fittizi e un archivio con note inventate. Le credenziali
sono in un file temporaneo con permessi 0600, senza stamparle. `--cleanup`
verifica l'identità di ogni fixture e usa la cancellazione effettiva per
rimuovere anche archivi personali, file e cronologia creati durante il QA.
Se esiste già un manifesto, riusarlo o completarne la pulizia prima di crearne
un altro. Non usare gli account principali del revisore come fixture.

## Prosecuzione QA: editor, sessioni e recupero password

- Creata una nota dalla UI iPhone Release; dopo il tocco di focus assistito da
  Jacopo, scritto testo tramite i pulsanti della tastiera nativa. La seconda
  persona fittizia lo riceve tramite WSS sul servizio pubblico. La modifica del
  peer è stata confermata e letta nel documento Yjs persistito. Riproducibile
  con `scripts/verify-native-sync.mjs` e fixture appena create. La prova copre
  client nativo → peer e persistenza dell'edit peer; il ritorno visivo sull'iPhone
  non è stato concluso, perché si è poi aperto il picker.
- Il client Node di prova deve inviare `Origin: https://notes`, come il WebView;
  una connessione senza Origin viene correttamente respinta con 403. La lettura
  del binario persistito usa la RPC riservata al servizio, mai un privilegio
  aggiunto al client. Non si è allargata la lista di origini del server.
- Rilevato archivio locale ancora visibile con errore tecnico dopo cancellazione
  esterna della fixture. Il caricamento fallito ora ricontrolla identità e
  appartenenze, dimentica la copia dell'archivio non più accessibile e torna al
  login o a un archivio ancora disponibile. Il cambio identità non tenta di
  salvare preferenze con token già rifiutato. La riprova interattiva di questo
  caso resta aperta per il limite del driver; non è dichiarata superata.
- Test di regressione aggiunti: 429 durante il controllo identità non elimina
  la sessione; la risposta tardiva di un vecchio account non cancella l'archivio
  attivo di un altro. I due test passano.
- Recupero password ora implementato: pagina esterna, link nel login
  mobile/web/desktop, token rimossi dall'indirizzo e sessione effimera separata.
  Tre test automatici passano. Prova Supabase con la sola fixture Partner:
  verifica di un token recovery reale, aggiornamento tramite il modulo applicativo,
  rifiuto della vecchia password e accesso riuscito con quella nuova. Nessuna
  email è stata inviata; consegna, dominio e redirect di produzione restano aperti.
- iPad Pro 11: installazione, apertura e layout iniziale di accesso osservati;
  campi compilati e tentativo di accesso eseguito, senza conferma conclusiva
  dell'archivio. Il driver ha restituito ripetuti errori di cattura video.
  Nessuna prova completa di rotazione, multitasking o editor tablet conclusa.
- iPhone: il menu allegati propone Choose Photo e Attach File. Dopo Attach File
  Device Hub non espone i controlli e la cattura diventa bianca; caricamento,
  annullamento e rientro dal picker restano non verificati. Non classificare
  questo come successo o come crash applicativo dimostrato.
- Android: l'emulatore isolato non è esposto fra le app controllabili da CUA;
  nessun test interattivo completo dichiarato. L'emulatore e l'iPad QA sono
  stati spenti per liberare risorse, senza intervenire sui simulatori personali.

Passaggi per account e dominio in [store-owner-setup.md](store-owner-setup.md).

Healthcheck della prosecuzione: **281 test superati**, nessun fallimento;
replay PostgreSQL, tipi, lint senza errori (23 avvisi Fast Refresh) e build web
superati. Nel preview isolato, il link recovery non valido viene rifiutato e
il frammento con i token di prova sparisce dall'indirizzo. Il controllo UI ha
permesso di correggere la lettura del frammento durante il doppio avvio di
React StrictMode. Le nuove fixture sono state rimosse con il flusso di
cancellazione e il file temporaneo delle credenziali eliminato.

Build successive alla prosecuzione: iOS Simulator Release compilata e
installata, Android `assembleRelease` compilato senza firma store, web e
renderer desktop ricompilati. Un primo tentativo iOS ha incontrato il timeout
dello scanner moduli Expo ed è passato al secondo tentativo; il primo Android
si è fermato per `ANDROID_HOME` mancante, prima della compilazione, ed è passato
impostando il percorso SDK locale. Non sono errori applicativi dichiarati risolti
con modifiche al codice. La riprova visiva del nuovo login sul simulatore resta
non conclusa per gli errori di cattura del driver. Il sito pubblico non è stato
aggiornato e non è stata emessa una release GitHub.
