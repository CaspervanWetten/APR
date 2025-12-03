- A:
  - Identificeren van situaties die ertoe kunnen leiden dat er een substantiele wijziging optreedt in de werking van het systeem
    - Input-output pair recording
  - Identificeren van situaties die een risico vormt tot de gezondheid, veiligheid of fundamentele rechten van een persoon
- B:
  - Het faciliteren van post-deployment analytica, met minstens:
    - Alle interacties met andere AI systemen
      - Identificatie van externe modellen
    - De prestaties van het AI systeem
      - De mate van nauwkeurigheid (WER, BERTScore, ROGUE-L)
      - Detectie van performance degradation over tijd
      - Detectie van model leakage
      - Mogelijkheid tot lange termijn trendreporting
    - Ingrepen van menselijk overzicht
      * Handmatige correcties van gegenereerde output
      * Tijd en aard van menselijke interventies
      * Reden van ingreep
    - Gebruikspatronen en gebruikersgedrag:
      - Frequentie, duur en type interacties
      - Opmerkelijke afwijkingen van verwacht gebruik
- C:
  - Het monitoren van de werking van het systeem op basis van de gebruiksinstructies
    - Detectie van gebruik buiten de beoogde doelstellingen of gebruikersgroepen
    - Vastleggen van systeemgedrag onder verschillende gebruikersomstandigheden
    - Signaleren van schendingen van vooraf gedefinieerde limieten of voorwaarden

To Log:

---

* **`datetime_utc`**: ISO 8601 timestamp of the event.
* **`gebruikersID`**: Identifier for the user.
* **`sessieID`**: Unique identifier for the user's session.
* **`transactieID`**: Unique identifier for a single, complete transaction (e.g., summarizing one document).
* **`activiteitID`**: Unique identifier for a specific event or step within a transaction.
* **`event_type`**: Type of event (`api_call`, `model_inference`, `user_interaction`, `human_intervention`, `error`, `performance_metric`).
* **`event_source`**: The component/module that generated the log (e.g., `app.py`, `prompting/engine.py`).
* **`gebruikteModel`**: Name and version of the AI model used.
* **`external_model_id`**: Identifier for any external AI model used.
* **`performance_metric`**: A dictionary for performance metrics.

  * WER
  * BERTScore
  * ROUGE_L
* **`ground_truth_id`**: Identifier for the ground truth data used for performance calculations
* **`model_leakage_signal`**: Float value indicating potential for a result to be model leakage
* **`intervention_type`**: Type of human action (`output_correction`, summary_correction, date_correction, verbalisant_correction  `system_override`).
* **`intervening_user_id`**: The user ID of the person who intervened.
* **`original_output`**: The model output before correction.
* **`corrected_output`**: The output after human correction.
* **`user_action`**: Specific user action (`submit_document`, `edit_summary`, `export_report`).
* **`interaction_duration_ms`**: Duration of the user interaction in milliseconds.
* **`risk_indicator`**: Flag for potential risks (`low_confidence`, `bias_detected`, `hallucination`).
* **`system_limit_exceeded`**: Name of the limit that was exceeded (`max_input_length`, `rate_limit`).
* **`out_of_scope_usage_signal`**: Flag for usage outside of the system's intended purpose.

### Implementatie:

Technical en administrative log split:

Technical:

- report case @ monitor_job
- error case @ monitor_job
- done case @ monitor_job
- update case @ monitor_job
- heartbeat case @ ws_job
- connection @ ws_job
- table-update @ ws_job

Administrative:

- report case @ monitor_job
- table-update case @ ws_job
- pv-individual-retry case @ ws_job
- update-pv-information case @ ws_job
- generateReport case @ ws_job
- cancel-task case @ ws_job
- delete-pv case @ ws_job
-
