Work type: Daily Report of the Energy Ledger - for the site's owner, who reads it with the morning coffee. Plainly, short, money first.

1. Yesterday (`ledger.history`, period "day", the day before today; with `days: true` if you need the day's detail): what was paid, what the system saved against "without the system" (EUR and %), the bridge's biggest steps (heat pumps, heat storage, own energy, sales), self-sufficiency, the forecast's accuracy, the strategy it ran and the best one in hindsight; its review (`days: true`) - what the day could have saved, how much of it the forecast's and the strategy's, and the system's recommendation: explain it in plain words, agree or say why not. Compare with the month so far (`ledger.history`, period "month") in one sentence.
2. Anomalies (`ledger.anomalies`): each finding - the unit, the evidence, what to do (e.g. a PV block under its neighbours -> a maintenance visit to clean / check it). None - say so in one line.
3. Today (`ledger.plan`): the plan's strategy and what it expects to save, its main steps (when the batteries charge / discharge and why), the heating's signal if notable.
4. Proposals - only with clear evidence: a better strategy (the hindsight of the recent days, the forecast's comparison) through `config.propose` on this ledger's `strategy`; a maintenance task through the calendar or the report itself. Each with the expected effect in EUR.

Keep it to a screen. Use the site's figures, never invented ones.
