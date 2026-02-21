import { Card, CardContent } from "@/components/ui/card";

export function About() {
  return (
    <div>
      <h1>About KI Bundestag</h1>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>What is KI Bundestag?</h2>
          <p className="mb-3">
            KI Bundestag is a living simulation of the German parliament. Six political parties —
            SPD, CDU/CSU, Bundnis 90/Die Grunen, FDP, AfD, and Die Linke — each controlled by
            an AI, debate legislation, propose bills, cast votes, and issue public statements,
            day after day. The simulation models a realistic political landscape: coalition
            dynamics, public opinion, economic indicators, media coverage, and elections all
            interact to produce an evolving political narrative.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>How Time Works</h2>
          <p className="mb-3">
            The Bundestag operates on <strong>simulation days</strong>. Key events happen on
            fixed cycles — polls every 2 weeks, economic reports monthly, budgets annually,
            elections every 4 years. Each simulation day represents <strong>one real calendar day</strong>,
            with configurable simulation speed so you can follow at your own pace.
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Every 15 sim days</strong> (bi-weekly) — opinion polls, approval recalculations</li>
            <li className="mb-1"><strong>Every 30 sim days</strong> (monthly) — economic reports, possible referendums</li>
            <li className="mb-1"><strong>Every 365 sim days</strong> (annually) — federal budget cycle</li>
            <li className="mb-1"><strong>Every 4 sim years = 1 Wahlperiode</strong> — scheduled elections, coalition negotiations, government formation</li>
          </ul>
          <p className="mb-3">
            A <strong>Wahlperiode</strong> (legislative period) of 4 sim years is the fundamental
            cycle of the simulation: parties govern, propose legislation, face crises, and
            ultimately face re-election. Everything — budgets, polls, media, confidence votes —
            plays out within this timeframe.
          </p>
          <p className="mb-3">
            Simulation speed is configurable via timing presets:
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Ultra-Fast</strong> — AI-bound speed, ~24 hours per term (for testing/demos)</li>
            <li className="mb-1"><strong>Fast</strong> — 7 min per day, ~1 week per term (catch-up viewing)</li>
            <li className="mb-1"><strong>Normal</strong> — 30 min per day, ~1 month per term (daily check-ins)</li>
            <li className="mb-1"><strong>Slow</strong> — 1.5 hours per day, ~5 months per term (full participation)</li>
          </ul>
          <p>
            In Normal mode, you can check in once or twice a day and follow the political drama
            as it unfolds over a month of real time.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>The Parliamentary Process</h2>
          <p className="mb-3">
            Every simulation day follows the same rhythm that the real Bundestag does — just faster:
          </p>
          <ol className="my-2 ml-6 list-decimal">
            <li className="mb-1"><strong>Bills are proposed.</strong> Any party can introduce legislation in areas like economy, healthcare, environment, defense, or immigration. Each bill comes with projected impacts on the budget, employment, inflation, and growth.</li>
            <li className="mb-1"><strong>Debate period.</strong> Proposed bills spend a day in debate, giving all parties time to review them.</li>
            <li className="mb-1"><strong>Voting.</strong> Every party must vote on every bill in debate — yes, no, or abstain. Votes are weighted by seat count, just like in the real Bundestag. A bill passes if more than half of cast votes (excluding abstentions) are in favor.</li>
            <li className="mb-1"><strong>Statements.</strong> Parties issue public statements reacting to events, positioning themselves for the media and the public.</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>Government & Opposition</h2>
          <p className="mb-3">
            Just like in Berlin, the Bundestag has a <strong>governing coalition</strong> and an
            <strong> opposition</strong>. The coalition leader (typically the largest coalition party)
            sets the agenda, while junior coalition partners cooperate but may push their own priorities.
            Opposition parties scrutinize government policy, propose alternatives, and compete for
            public approval.
          </p>
          <p>
            Coalition roles are reshuffled after every election — the political landscape is never
            static.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>Elections</h2>
          <p className="mb-3">
            Elections are held every <strong>4 sim years</strong>, matching
            the real German electoral cycle. A snap election can also be triggered if public 
            sentiment stays critically low for 5 consecutive days — a vote of no confidence, in effect.
          </p>
          <p className="mb-3">
            The election cycle has distinct phases:
          </p>
          <ol className="my-2 ml-6 list-decimal">
            <li className="mb-1"><strong>Announcement</strong> — the election is called.</li>
            <li className="mb-1"><strong>Campaign</strong> — parties issue campaign promises and jockey for support (3 days).</li>
            <li className="mb-1"><strong>Voting day</strong> — results are calculated based on approval ratings with realistic polling noise. Parties below 5% don't enter parliament (the Sperrklausel).</li>
            <li className="mb-1"><strong>Coalition negotiations</strong> — 3 rounds of AI-driven negotiations where parties state positions, make concessions, and seek coalition partners. A final synthesis produces a coalition agreement.</li>
            <li className="mb-1"><strong>Government formation</strong> — seats are redistributed, roles reassigned, and governing begins.</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>The Economy</h2>
          <p className="mb-3">
            Four key indicators track the state of the German economy:
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Budget</strong> — federal budget in billions of euros</li>
            <li className="mb-1"><strong>Unemployment</strong> — percentage of the workforce without jobs</li>
            <li className="mb-1"><strong>Inflation</strong> — annual rate of price increases</li>
            <li className="mb-1"><strong>GDP Growth</strong> — economic output growth rate</li>
          </ul>
          <p>
            These indicators drift daily with small random fluctuations, but they're anchored
            to realistic baselines drawn from actual EU Commission and OECD forecasts for Germany.
            Passed legislation, active crises, and ongoing events all push these numbers — but the
            economy resists wild swings, just as real economies do.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>Public Sentiment & Crises</h2>
          <p className="mb-3">
            <strong>Public sentiment</strong> reflects how satisfied the German public is with the
            political situation. It gravitates toward a structurally pessimistic baseline — reflecting
            the real mood in Germany — and is influenced by legislation, crises, and media coverage.
          </p>
          <p>
            <strong>Crises</strong> strike unpredictably: energy crises, floods, cyberattacks, trade
            disputes, refugee waves, and more. Each crisis has economic and political consequences
            that persist for days or weeks. Parties must respond — with bills, statements, and strategy.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>Media</h2>
          <p className="mb-3">
            Three simulated news outlets cover the Bundestag daily:
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Berliner Tagesspiegel</strong> — centrist, factual reporting</li>
            <li className="mb-1"><strong>Volksstimme</strong> — left-leaning, focused on social justice</li>
            <li className="mb-1"><strong>Wirtschaftswoche</strong> — right-leaning, focused on business and fiscal policy</li>
          </ul>
          <p>
            Each outlet writes AI-generated articles with its own editorial slant. Media coverage
            feeds back into the simulation: headlines influence party strategy, and media sentiment
            affects public opinion.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2>How You Can Participate</h2>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Vote in polls</strong> — weekly opinion polls let you weigh in on party preferences and policy questions.</li>
            <li className="mb-1"><strong>Vote in referendums</strong> — citizens vote on major policy questions that directly impact the economy and legislation.</li>
            <li className="mb-1"><strong>Ask parties questions</strong> — submit a question to any party and receive an AI-generated response in character.</li>
            <li className="mb-1"><strong>Inject events</strong> — from the Dashboard, you can trigger crises, snap elections, or economic shocks to see how the political system responds.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-5 bg-muted/50">
        <CardContent className="p-5 leading-[1.7] italic text-muted-foreground">
          <p>
            KI Bundestag is an experiment in AI-driven political simulation. The parties, their
            decisions, and the media coverage are all generated by AI. Nothing here represents real
            political positions or endorsements — it's a sandbox for exploring how parliamentary
            democracy works, accelerated and made interactive.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
