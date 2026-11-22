# Gestione abusi – da attivare prima del lancio

Responsabile indicato: Jacopo Vincenzo Ansalone. Contatto pubblico:
support@nappnote.com (segnalazioni: safety@nappnote.com, alias di support@). Con Resend configurato, ogni nuovo report invia un avviso con ID, motivo e data alla casella safety. La coda richiede comunque un responsabile e il controllo della consegna.

Prima del lancio concordare e attivare un controllo almeno quotidiano, con
presa in carico degli abusi entro 24 ore e priorità alle minacce e allo
sfruttamento di minori. Non dichiarare questo servizio operativo finché la
copertura non è effettivamente assicurata.

## Strumenti amministrativi

Eseguire dalla radice del repository con CLI Supabase autenticata. Le chiavi
service role restano in memoria e non devono essere copiate nel client.

```sh
node scripts/moderate-reports.mjs --queue
node scripts/moderate-reports.mjs --show UUID_SEGNALAZIONE
node scripts/moderate-reports.mjs --hide UUID_SEGNALAZIONE
node scripts/moderate-reports.mjs --dismiss UUID_SEGNALAZIONE
node scripts/moderate-reports.mjs --erasures
node scripts/moderate-reports.mjs --suspend UUID_ACCOUNT
node scripts/moderate-reports.mjs --unsuspend UUID_ACCOUNT
node scripts/moderate-reports.mjs --notice-decision UUID_SEGNALAZIONE "Decisione, motivazione e mezzi di ricorso"
```

`--show` contiene dati privati: non incollarli in issue pubbliche, log CI o
chat. `--hide` oscura sotto RLS la nota, il commento, il messaggio o lo sticker oggetto della segnalazione; `--dismiss`
chiude una segnalazione senza aggiungere un divieto globale. Non usare
`--dismiss` come comando di ripristino di una nota già nascosta. La sospensione blocca le scritture in Postgres, revoca le sessioni e applica il ban in Auth. Per le richieste di cancellazione di account sospesi usare il contatto privacy e l'identificazione del richiedente prevista dalla procedura approvata. Il client non può eseguire
azioni di moderazione amministrativa.

Una segnalazione in attesa nasconde la nota solo al segnalante; il moderatore
valuta anche testo e allegati della copia segnalata. Il blocco è bidirezionale
per visibilità di note/commenti e inviti, ma non rimuove appartenenze esistenti
né documenti creati da un terzo. Le interfacce descrivono questo limite.

Rimuovere contenuti vietati dopo verifica, documentare privatamente la decisione
e rispondere alle richieste arrivate al contatto pubblico. Non scaricare o
redistribuire materiale illecito per la verifica; applicare la procedura
appropriata alle segnalazioni di sfruttamento e alle richieste delle autorità.

## Cancellazioni bloccate e conservazione

`--erasures` mostra solo il numero di job pendenti. Il worker ritenta ogni
minuto; una coda che resta non vuota richiede controllo dei log Edge e degli
esiti pg_net, senza esportare password o segreti Vault. Non eliminare Auth
manualmente prima dei file e non cancellare direttamente righe Storage.

Le ricevute casuali scadono dopo sette giorni. I report in attesa restano fino
alla revisione; quelli già rivisti scadono dopo 365 giorni per child safety e 90 giorni per gli altri casi, secondo `private.safety_retention`. La cancellazione dell'account o del contenuto non elimina il report. Un legal hold blocca la cancellazione che coinvolge prove vincolate. Il
filtro di un contenuto confermato resta anche dopo la scadenza del report.
Le copie di backup e i log richiedono scadenze operative verificate, ancora da confermare. Vedi [Decisioni legali](legal-decisions.md).

## Worker prove e coda DSA

Pubblicare `safety-worker` nell'ambiente approvato e impostare in Vault
`napp_safety_worker_endpoint` con l'URL della funzione e
`napp_safety_worker_key` con il bearer service role. Il job pg_cron
`napp-safety-worker` invoca la funzione ogni minuto. Il worker copia i file
nel bucket privato `safety-evidence`, elimina le copie scadute e rimuove gli
upload orfani di chat tramite l'API Storage. Verificare che le copie pendenti,
i job in ritardo e gli errori pg_net vengano monitorati. La copia confermata
sblocca la normale eliminazione degli originali quando non c'è un hold.

`private.account_legal_holds` contiene gli account vincolati.
`private.safety_reports.legal_hold` protegge la prova del singolo caso.
Prima di modificare un vincolo registrare motivo, autorità, data e responsabile
nel fascicolo riservato. Lo scanner supporta la quarantena, il ban e la
creazione di un report `child_safety` senza avvisare l'uploader.
`scan_new_uploads` è disattivato e il provider predefinito è `noop`.

Configurare `napp_report_mail_key`, `napp_report_mail_to` e
`napp_report_mail_from` in Vault con il dominio mittente verificato in Resend.
Le segnalazioni `child_safety` sono in testa alla coda e generano subito
un avviso interno. Controllare la casella e la coda per garantire presa in
carico entro 24 ore. Le notifiche del modulo pubblico inviano la ricevuta e
la decisione all'indirizzo fornito. Per una segnalazione esterna usare
`--notice-decision` e annotare separatamente qualunque rimozione effettuata.
