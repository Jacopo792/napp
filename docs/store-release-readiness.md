# Napp – preparazione App Store e Google Play

Aggiornamento: 24 ottobre 2026. **Invio bloccato, obiettivo ancora aperto.**
Jacopo ha confermato che Apple Developer Program e Google Play Console non sono
ancora attivi. Nessuna build è stata inviata a uno store; nessuna release è
stata dichiarata pronta. Commit/push e aggiornamento release finale restano
subordinati alla verifica richiesta da Jacopo.

## Implementato e verificato

| Area                    | Evidenza                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancellazione effettiva | Migrazioni e worker pubblicati su Supabase. Test remoto con account fittizi: identità, file, avatar, cronologia e Yjs propri rimossi; documenti altrui e relativi allegati conservati; vecchi token non ricreano dati.                |
| Cancellazione nelle app | Interfacce mobile e web/desktop; password fresca, conferma conseguenze, gestione risposta persa e pulizia locale. Pagina esterna implementata, da pubblicare con il sito.                                                             |
| Segnalazioni e blocco   | Backend pubblicato; test remoto superato con account fittizi su note, commenti, coda privata, blocco/sblocco, autore non falsificabile e nuove letture Storage. Sono ancora possibili copie già scaricate.                            |
| Regole e contatti       | Privacy, termini, assistenza, accettazione alla registrazione e per account esistenti. Titolare Jacopo Vincenzo Ansalone; email ansalonejacpo@gmail.com.                                                                              |
| Ripresa e conservazione | Test remoto della ripresa senza client superato; nessuna cancellazione pendente al controllo finale. Migrazione `20261024050000` applicata: report revisionati eliminati dopo 90 giorni.                                              |
| Server pubblico         | `https://notes-collab.onrender.com/healthz` e `/readyz`: HTTP 200 al controllo del 24 ottobre. Non è una prova di disponibilità futura o di ripristino backup.                                                                        |
| Permessi e firma        | Configurati picker di sistema, rimozione microfono/fotocamera/accesso generale ai media, firma Android da variabili private. Un bundle store non può usare la chiave debug. Verificare manifest finale e firma con chiave definitiva. |

Il contratto tecnico della cancellazione è in
[account-deletion-handoff.md](account-deletion-handoff.md).

## Condizioni che impediscono di dichiarare pronta la release

| Blocco               | Lavoro necessario                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account sviluppatore | Attivare Apple Developer Program e Play Console, completare verifiche identità/contatti e requisiti dell'account. Controllare l'eventuale test chiuso richiesto da Google.                                                                                                         |
| Email di produzione  | Auth pubblico confermato con `mailer_autoconfirm=true`. Recupero password implementato e provato sul backend con fixture. Configurare SMTP, pubblicare la pagina e autorizzare il redirect; verificare consegna/conferma e recupero accesso prima di riattivare la conferma email. |
| Operazioni e privacy | Confermare ubicazioni dati, fornitori effettivi, trasferimenti, tempi log/backup e ripristino che rispetti le cancellazioni. Completare l'informativa con questi dati reali. Attivare il controllo regolare della coda abusi e dei job di cancellazione.                           |
| QA e firme           | Concludere controlli codice e build native; prova su iPhone, iPad e Android di registrazione, consenso, login, inviti, sync, allegati, segnalazioni/blocco, eliminazione e cambio account. Generare/registrare chiave upload Android e certificati/profili Apple.                  |
| Pagine e console     | Pubblicare privacy, termini, supporto e pagina cancellazione, verificarne il contenuto pubblico (HTTP 200 da solo non basta). Compilare App Privacy, Data safety, età, app access, schede e screenshot coerenti con la build finale.                                               |

## Build e distribuzione

Versione mantenuta a **0.9.43** fino alla conclusione delle verifiche. Non è un
nuovo tag di pubblicazione. Le cartelle native sono generate e ignorate da Git.
La configurazione dei permessi e della firma vive in `apps/mobile/app.config.ts`
e `apps/mobile/plugins/with-release-signing.cjs`.

Per un AAB Google Play:

```sh
# Esportare privatamente NAPP_ANDROID_KEYSTORE, NAPP_ANDROID_KEY_ALIAS,
# NAPP_ANDROID_STORE_PASSWORD e NAPP_ANDROID_KEY_PASSWORD.
# Non inserire password in comandi salvati, log, file versionati o chat.
pnpm --filter @notes-app/mobile build:android:store
```

La chiave deve corrispondere a quella registrata in Play Console e avere backup
privato. Non generarla nuovamente a ogni build. La build iOS senza firma valida
la compilazione; per l'invio occorrono archive, firma di distribuzione e
validazione App Store Connect.

Requisiti ufficiali verificati il 24 ottobre 2026: Apple richiede Xcode 26+
e SDK iOS/iPadOS 26+ dal 28 aprile 2026; qui è installato Xcode 27.1. Google
richiede target Android 16/API 36+ dal 31 agosto 2026. Confermare anche le
librerie native/compatibilità 16 KB e il target nel binario finale.

## Proxmox

Non spostare l'infrastruttura durante questa preparazione. Il backend pubblico
attuale è raggiungibile. Proxmox potrà ospitare il servizio collaborativo dopo
una verifica separata di HTTPS/WSS, disponibilità esterna, aggiornamenti,
monitoraggio, backup esterni e ripristino. Spostare anche Auth/Postgres/Storage
richiederebbe una migrazione ulteriore e l'aggiornamento dell'informativa.

## Fonti

- [Apple – App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): 1.2, 2.1, 5.1.1.
- [Apple – Account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).
- [Apple – App Privacy](https://developer.apple.com/app-store/app-privacy-details/).
- [Apple – SDK requirements](https://developer.apple.com/news/upcoming-requirements/?id=02032026a).
- [Google – UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).
- [Google – Account deletion](https://support.google.com/googleplay/android-developer/answer/18258653?hl=en).
- [Google – Target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- [Expo – ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/).
- [Supabase – User management](https://supabase.com/docs/guides/auth/managing-user-data).

## Evidenze tecniche aggiuntive

Regione Supabase letta dalla CLI: `eu-west-1` (Irlanda). Non dimostra che tutti
i log, gli accessi di assistenza o gli altri fornitori restino in UE: verificare
i contratti e i trasferimenti prima della privacy policy definitiva.

La build store Android senza `NAPP_ANDROID_KEYSTORE` è stata provata: viene
rifiutata prima della compilazione, anziché produrre un bundle firmato debug.
Il JDK per le prove locali è quello già incluso in Android Studio.

## Esito delle compilazioni

Ultimo healthcheck superato: 281 test, nessun fallimento; lint senza errori, tipi e build
web superati. Renderer desktop compilato. iOS Release compilato senza firma con
SDK 27.1; Android Release compilato senza firma, target API 36 e controllo 16 KB
ARM64/zipalign superato. Questi artefatti locali non sono ancora build firmate
per gli store e non sostituiscono il QA fisico. Evidenze e limiti sono in
[store-validation-2026-10-24.md](store-validation-2026-10-24.md).

## Correzione successiva e QA nativo

Migrazione `20261024060000_erasure_mention_cleanup.sql` applicata: una menzione
preesistente verso un utente poi bloccato non può impedire la pulizia di un
terzo account. Test PostgreSQL e test remoto completo superati, con verifica
che le restrizioni restino attive per il client autenticato. Suite: 276 test
superati dopo la correzione.

Build Release per iOS Simulator compilata. Su un dispositivo virtuale nuovo
sono stati osservati accesso con account fittizio e caricamento di note
condivise, oltre ai controlli di registrazione/consenso. Con assistenza manuale
alla navigazione sono stati verificati invio report fino alla coda privata,
blocco/sblocco fino al backend e protezioni/annullamento della cancellazione.
Il menu Safety usa il popover di Napp e la nuova build è stata osservata.
Le fixture sono state eliminate col flusso effettivo di cancellazione.
Il QA resta parziale: Device Hub non espone tutti i controlli al driver e le
azioni a coordinate falliscono; mancano la cancellazione completa dalla UI e
le altre prove native elencate sopra. Questi limiti non sono esiti positivi.
