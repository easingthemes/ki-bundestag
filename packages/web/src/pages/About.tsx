export function About() {
  return (
    <div>
      <h1>About KI Bundestag</h1>

      <div className="about-section card">
        <h2>What is KI Bundestag?</h2>
        <p>
          KI Bundestag is a living simulation of the German parliament. Six political parties —
          SPD, CDU/CSU, Bundnis 90/Die Grunen, FDP, AfD, and Die Linke — each controlled by
          an AI, debate legislation, propose bills, cast votes, and issue public statements,
          day after day. The simulation models a realistic political landscape: coalition
          dynamics, public opinion, economic indicators, media coverage, and elections all
          interact to produce an evolving political narrative.
        </p>
      </div>

      <div className="about-section card">
        <h2>How Time Works</h2>
        <p>
          The Bundestag operates on <strong>simulation days</strong>. Each simulation day
          represents roughly <strong>one week</strong> of real parliamentary activity —
          condensed so that meaningful political developments happen at a pace you can follow.
          In practice, a new simulation day runs every 30 seconds to a few minutes, depending
          on configuration. This means:
        </p>
        <ul>
          <li><strong>7 simulation days</strong> ~ 1 month of political life (weekly opinion polls, approval recalculations)</li>
          <li><strong>30 simulation days</strong> ~ 1 quarter (monthly economic reports, possible referendums)</li>
          <li><strong>120 simulation days</strong> ~ 1 legislative period (scheduled elections)</li>
        </ul>
        <p>
          You might see several weeks of parliamentary drama unfold within a single afternoon.
        </p>
      </div>

      <div className="about-section card">
        <h2>The Parliamentary Process</h2>
        <p>
          Every simulation day follows the same rhythm that the real Bundestag does — just faster:
        </p>
        <ol>
          <li><strong>Bills are proposed.</strong> Any party can introduce legislation in areas like economy, healthcare, environment, defense, or immigration. Each bill comes with projected impacts on the budget, employment, inflation, and growth.</li>
          <li><strong>Debate period.</strong> Proposed bills spend a day in debate, giving all parties time to review them.</li>
          <li><strong>Voting.</strong> Every party must vote on every bill in debate — yes, no, or abstain. Votes are weighted by seat count, just like in the real Bundestag. A bill passes if more than half of cast votes (excluding abstentions) are in favor.</li>
          <li><strong>Statements.</strong> Parties issue public statements reacting to events, positioning themselves for the media and the public.</li>
        </ol>
      </div>

      <div className="about-section card">
        <h2>Government & Opposition</h2>
        <p>
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
      </div>

      <div className="about-section card">
        <h2>Elections</h2>
        <p>
          Elections are held every <strong>120 simulation days</strong> (roughly one legislative
          period). A snap election can also be triggered if public sentiment stays critically
          low for 5 consecutive days — a vote of no confidence, in effect.
        </p>
        <p>
          The election cycle has distinct phases:
        </p>
        <ol>
          <li><strong>Announcement</strong> — the election is called.</li>
          <li><strong>Campaign</strong> — parties issue campaign promises and jockey for support (3 days).</li>
          <li><strong>Voting day</strong> — results are calculated based on approval ratings with realistic polling noise. Parties below 5% don't enter parliament (the Sperrklausel).</li>
          <li><strong>Coalition negotiations</strong> — 3 rounds of AI-driven negotiations where parties state positions, make concessions, and seek coalition partners. A final synthesis produces a coalition agreement.</li>
          <li><strong>Government formation</strong> — seats are redistributed, roles reassigned, and governing begins.</li>
        </ol>
      </div>

      <div className="about-section card">
        <h2>The Economy</h2>
        <p>
          Four key indicators track the state of the German economy:
        </p>
        <ul>
          <li><strong>Budget</strong> — federal budget in billions of euros</li>
          <li><strong>Unemployment</strong> — percentage of the workforce without jobs</li>
          <li><strong>Inflation</strong> — annual rate of price increases</li>
          <li><strong>GDP Growth</strong> — economic output growth rate</li>
        </ul>
        <p>
          These indicators drift daily with small random fluctuations, but they're anchored
          to realistic baselines drawn from actual EU Commission and OECD forecasts for Germany.
          Passed legislation, active crises, and ongoing events all push these numbers — but the
          economy resists wild swings, just as real economies do.
        </p>
      </div>

      <div className="about-section card">
        <h2>Public Sentiment & Crises</h2>
        <p>
          <strong>Public sentiment</strong> reflects how satisfied the German public is with the
          political situation. It gravitates toward a structurally pessimistic baseline — reflecting
          the real mood in Germany — and is influenced by legislation, crises, and media coverage.
        </p>
        <p>
          <strong>Crises</strong> strike unpredictably: energy crises, floods, cyberattacks, trade
          disputes, refugee waves, and more. Each crisis has economic and political consequences
          that persist for days or weeks. Parties must respond — with bills, statements, and strategy.
        </p>
      </div>

      <div className="about-section card">
        <h2>Media</h2>
        <p>
          Three simulated news outlets cover the Bundestag daily:
        </p>
        <ul>
          <li><strong>Berliner Tagesspiegel</strong> — centrist, factual reporting</li>
          <li><strong>Volksstimme</strong> — left-leaning, focused on social justice</li>
          <li><strong>Wirtschaftswoche</strong> — right-leaning, focused on business and fiscal policy</li>
        </ul>
        <p>
          Each outlet writes AI-generated articles with its own editorial slant. Media coverage
          feeds back into the simulation: headlines influence party strategy, and media sentiment
          affects public opinion.
        </p>
      </div>

      <div className="about-section card">
        <h2>How You Can Participate</h2>
        <ul>
          <li><strong>Vote in polls</strong> — weekly opinion polls let you weigh in on party preferences and policy questions.</li>
          <li><strong>Vote in referendums</strong> — citizens vote on major policy questions that directly impact the economy and legislation.</li>
          <li><strong>Ask parties questions</strong> — submit a question to any party and receive an AI-generated response in character.</li>
          <li><strong>Inject events</strong> — from the Dashboard, you can trigger crises, snap elections, or economic shocks to see how the political system responds.</li>
        </ul>
      </div>

      <div className="about-section card about-footer">
        <p>
          KI Bundestag is an experiment in AI-driven political simulation. The parties, their
          decisions, and the media coverage are all generated by AI. Nothing here represents real
          political positions or endorsements — it's a sandbox for exploring how parliamentary
          democracy works, accelerated and made interactive.
        </p>
      </div>
    </div>
  );
}
