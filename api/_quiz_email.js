// The Get Started quiz email (Dakotah, Nov 22, 2026): ONE email with
// everything: their result, the next step with a link, a free scoping call link,
// and what they told us. Plain text from "Gina Merritt" so it lands in the main
// inbox. Plan results link straight to making an account on that plan (from
// Dec 1; before then the link is the same and the email says when it opens).

const TIER = { learn: ['Basic', 'Member'], room: ['Builder', 'Builder'], premium: ['Premium', 'Premium'], owner: ['Elite', 'Owner'] };

export function quizEmail({ name, email, outcome, answers = [], site, callLink, launched }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const plan = TIER[outcome.key];
  let next;
  if (plan) {
    const link = `${site}/?join=1&plan=${plan[0]}&email=${encodeURIComponent(email)}`;
    next = launched
      ? `Your next step: make your account on the ${plan[1]} plan. This link takes you straight there, with this email address:\n${link}`
      : `Your next step: the ${plan[1]} plan. GroundUp opens to everyone on December 1. From that day, this link takes you straight to making your account on the ${plan[1]} plan, with this email address:\n${link}`;
  } else if (outcome.key === 'advisory') {
    next = `Your next step: the Full Project Intake, where I review your project and tell you what to do next:\n${site}/contact?book=advisor`;
  } else if (outcome.key === 'org') {
    next = `Your next step: tell us about your organization, and we'll show you how GroundUp works for a group:\n${site}/partner-interest`;
  } else {
    next = `Your next step: save a free seat at my next Lunch & Learn. It's the easiest way to see how this works:\n${site}/go/lunch`;
  }
  const call = callLink
    ? `Want to talk it through with a person first? Book a free 20-minute call with our team:\n${callLink}`
    : `Want to talk it through with a person first? Book a free 20-minute call with our team:\n${site}/go/call`;
  const told = answers.length
    ? `\n\nWhat you told us:\n${answers.map(a => `•  ${a.q} ${a.a}`).join('\n')}`
    : '';
  return {
    subject: `Your GroundUp result: ${outcome.title}`,
    text: `Hi ${first},

Here's our honest read from your answers:

${outcome.title}

${outcome.body}

${next}

${call}

If you have any questions, just reply to this email.

Warmly,
Gina

Dr. Gina Merritt
Founder, GroundUp
community.drginamerritt.net${told}

———
You're getting this because you took the GroundUp quiz.`,
  };
}
