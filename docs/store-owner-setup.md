# Passaggi di Jacopo prima dell'invio agli store

Verificato il 24 ottobre 2026. La preparazione del codice e l'attivazione degli
account sono lavori distinti; non sono ancora stati effettuati acquisti o invii.

## 1. Apple Developer Program

Iscriviti come individuo con il tuo Apple Account, nome legale **Jacopo Vincenzo
Ansalone**, autenticazione a due fattori e recapiti verificabili. Apple indica
99 USD l'anno, con importo in valuta locale durante l'iscrizione. Il tuo nome
legale comparirà come venditore. Completa personalmente identità, accordi e
pagamento; poi comunica che l'iscrizione è attiva e il Team ID da usare.

Quando attivo: registrare `io.github.jacopo792.napp`, creare Napp in App Store
Connect, configurare firma/profili e caricare la build su TestFlight. Il Team ID
attualmente nel progetto deve essere confrontato con il team effettivamente
abilitato. Compilare correttamente anche lo stato di trader per la distribuzione
UE e i recapiti eventualmente richiesti; non dedurlo dal solo tipo di account.

Fonte: [iscrizione Apple](https://developer.apple.com/programs/enroll/),
[requisiti trader UE](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/).

## 2. Google Play Console

Crea l'account personale con dati reali, completa verifica identità e verifica
del dispositivo Android attraverso l'app Play Console. Google indica 25 USD
una tantum. Accordi, documenti e pagamento sono da completare personalmente.

Organizza **almeno 12 tester**, iscritti al test chiuso continuativamente per
**14 giorni**, come previsto per i nuovi account personali. Devono provare
l'app e fornire feedback: raggiungere il conteggio da solo non garantisce
l'accesso alla produzione. Quando l'account è attivo si crea l'app con package
`io.github.jacopo792.napp`, si registra la chiave upload con backup privato e si
carica l'AAB firmato sul canale di test. Nessuna chiave o password in chat.

Fonti: [registrazione Play Console](https://support.google.com/googleplay/android-developer/answer/6112435?hl=it),
[test nuovi account personali](https://support.google.com/googleplay/android-developer/answer/14151465?hl=it).

## 3. Dominio e email

Registra a tuo nome un dominio per Napp e conserva l'accesso alla gestione DNS;
comunica il nome acquistato. Un dominio personale non è un requisito assoluto
per la pubblicazione come individuo, ma dà a sito e mittente email un indirizzo
stabile. Non acquistare un server per questo passaggio: sito e pagine pubbliche
possono essere pubblicati sull'hosting statico esistente.

Dopo la scelta si configurano dominio/HTTPS, URL pubblici di privacy, termini,
assistenza, cancellazione e recupero password; si aggiornano origine web,
percorsi di build, redirect Auth e origini WSS consentite. Prima di cambiare
le origini, mantenere accessibili i client già distribuiti.

Serve anche un mittente sul dominio con servizio SMTP di produzione, record
DNS di autenticazione e destinatario assistenza presidiato. Il solo dominio
non invia email. Non usare il server email predefinito Supabase per il pubblico.
Provare conferma account e recupero su indirizzi esterni prima di riattivare
la conferma email. Il redirect da autorizzare è la pagina pubblica con
`?action=reset-password`; il completamento del recupero avviene nel browser.

Fonte: [SMTP di produzione Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## 4. Disponibilità operativa

Conferma chi controllerà la coda segnalazioni e gli errori di cancellazione,
con quale frequenza, e verifica con i fornitori i tempi reali di backup/log.
I comandi sono in `moderation-operations.md`. La predisposizione tecnica non
equivale a un servizio di moderazione già presidiato.

## 5. Prima della release

Completare la matrice QA in `store-submission.md`, i test con le build firmate,
le dichiarazioni privacy e gli screenshot reali. Solo a verifiche concluse:
versione coordinata mobile/desktop/web, healthcheck, commit/push e release.
Il trasferimento su Proxmox resta un'attività separata da non sommare all'invio.
