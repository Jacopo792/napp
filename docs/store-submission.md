# Materiali di invio – bozza da verificare nelle console

Non inviati. Gli account sviluppatore non sono ancora attivi. Queste indicazioni
vanno confrontate con il binario firmato, gli SDK inclusi e l'infrastruttura
finale: non sono risposte già salvate nelle console.

## Identità, link e accesso revisore

- Nome: Napp. Bundle/package: `io.github.jacopo792.napp`.
- Titolare: Jacopo Vincenzo Ansalone.
- Assistenza/privacy/abusi: ansalonejacpo@gmail.com.
- Privacy: `https://jacopo792.github.io/napp/?page=privacy`.
- Supporto: `https://jacopo792.github.io/napp/?page=support`.
- Termini: `https://jacopo792.github.io/napp/?page=terms`.
- Cancellazione esterna: `https://jacopo792.github.io/napp/?action=delete-account`.
- Recupero password: `https://jacopo792.github.io/napp/?action=reset-password`.

I link sono implementati localmente: verificarne il contenuto dopo il deploy,
anonimamente su telefono. Il server statico può restituire 200 anche se sta
mostrando la vecchia app senza queste schermate.

Creare due account revisore con email verificata e archivio condiviso già
popolato da dati inventati. Credenziali solo nei campi riservati della console,
mai nel repository. Prevedere un account aggiuntivo sacrificabile per la prova
di cancellazione e ripristinarlo per ogni nuova revisione; non cancellare
l'account principale del revisore durante la preparazione.

## Inventario per App Privacy / Data safety

| Dato effettivo                                                             | Collegato all'account                         | Scopo da dichiarare                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| Email e identificativo Auth                                                | Sì                                            | Accesso, gestione account e sicurezza                                |
| Nome visualizzato e avatar                                                 | Sì                                            | Profilo e collaborazione                                             |
| Note, documenti e allegati (anche foto/video/file secondo quanto caricato) | Sì                                            | Archiviazione, sincronizzazione e condivisione richiesta dall'utente |
| Commenti, menzioni, reazioni e versioni                                    | Sì                                            | Collaborazione                                                       |
| Appartenenze, inviti e presenza facoltativa                                | Sì                                            | Collaborazione e accesso agli archivi                                |
| Preferenze sincronizzate                                                   | Sì                                            | Funzionamento e personalizzazione                                    |
| Segnalazioni, copia del contenuto segnalato e blocchi                      | Sì, fino alla cancellazione/scadenza prevista | Prevenzione abusi e moderazione                                      |
| IP e log tecnici dei fornitori                                             | Verificare configurazione e conservazione     | Sicurezza, funzionamento e diagnosi                                  |

Nessun SDK pubblicitario/tracking trovato nell'inventario del progetto. Non
selezionare automaticamente “nessun dato raccolto”: i contenuti sono inviati a
un backend. Per Apple selezionare le categorie effettivamente pertinenti a
contatti, identificativi e contenuti utente; per Google verificare anche file,
foto/video e contenuti generati dall'utente. La distinzione Google tra raccolta
e condivisione deve riflettere le eccezioni per fornitori di servizio e azioni
richieste dall'utente, non una supposizione “nessuna condivisione”.

Trasporto previsto HTTPS/WSS; nessuna crittografia end-to-end. Il picker di
sistema limita l'accesso ai file scelti. Il manifest finale deve escludere
microfono, fotocamera e permessi generali di foto/video/storage che l'app non
usa. Confermare le privacy manifest delle dipendenze nella build Apple finale;
il manifest applicativo dichiara i dati elaborati dal servizio, collegati
all’account, per il funzionamento, senza tracking. Confermare le categorie
rispetto ai dati e log effettivi prima dell’invio.

## Note per App Review – testo da completare

Napp is a private shared-notes application. Use the review accounts supplied in
the App Review Information section. They belong to a shared archive containing
fictional notes, comments and attachments. No real customer data is required.

Account deletion: Settings → Account → Delete account. The user enters the
account password and confirms permanent deletion. The server deletes the account,
its notes, attachments and history; documents created by other members remain,
including edits and files those documents require. An interrupted deletion
continues automatically. Use the separate disposable account supplied for this
test rather than deleting the main review account.

Safety: report another member's note from its note menu/sheet; report a comment
from its actions; report or block a member from Settings → Safety on mobile or
the person's sheet on web/desktop. Blocked accounts can be managed in Settings.
Reports go to a private moderation queue. Pending reports hide the note from
the reporter; confirmed restrictions are enforced on the backend.

Privacy, terms and support are linked from sign-in and Settings. The same
account-deletion flow is available outside the app at the deletion URL above.
Forgot password opens the public recovery page. Recovery runs in an isolated
session and does not replace another account open in the app. Verify production
email delivery and the allowed redirect before submitting the build.

Prima dell'invio adattare queste istruzioni alle etichette effettive della build
firmata, allegare video solo se necessario e fornire contatto revisore raggiungibile.

## QA che deve avere esito prima dell'invio

1. Su iPhone, iPad e Android: registrazione/conferma email, consenso, login/logout,
   cambio account, invito e scrittura sincronizzata fra due dispositivi.
2. Foto/file, commenti e reazioni, tastiera, rotazione/iPad, rete persa e recupero.
3. Segnalare nota e commento; bloccare/sbloccare un membro; verificare effetto da
   una seconda sessione e accesso ai documenti di terze persone.
4. Eliminare un account fittizio dall'app e uno dalla pagina esterna; verificare
   che il secondo membro conservi i propri documenti e perda quelli cancellati.
5. Eseguire test preliminari Play/TestFlight, controllare crash, firme, API target,
   librerie native 16 KB, privacy manifest, link pubblici e screenshot reali.

## Condizione per la release GitHub

Solo dopo il via libera tecnico e la risoluzione dei blocchi in
`store-release-readiness.md`: aggiornare insieme versioni web/desktop/mobile,
CHANGELOG e `whatsNew`, eseguire `pnpm healthcheck`, verificare il diff condiviso
con il lavoro di Claude, poi commit/push/tag secondo `CLAUDE.md`. Una build locale
senza firma non è un artefatto distribuibile sugli store.

Fonti manifest: [Apple – data collection](https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest),
[Expo – privacy manifests](https://docs.expo.dev/guides/apple-privacy/).
Le ragioni API provengono dai manifest React Native ed Expo FileSystem inclusi
nelle dipendenze installate; vanno riesaminate quando cambiano SDK e utilizzo.
