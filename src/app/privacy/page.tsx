export const metadata = { title: "Privacy · Phone Tree" };

export default function Privacy() {
  return (
    <main className="page stack" style={{ maxWidth: 720 }}>
      <h1>Phone Tree privacy policy</h1>
      <p>
        Phone Tree is a private scheduling tool used by one family to offer babysitting jobs to babysitters they know
        personally. This page explains what it stores and how text messages work.
      </p>
      <h2>What we collect</h2>
      <p>
        A sitter&apos;s name, mobile number, usual hourly rate, general weekly availability, and their replies to job texts.
        For the parents: their names and mobile numbers.
      </p>
      <h2>How it&apos;s used</h2>
      <p>
        Only to offer babysitting jobs, confirm bookings, send reminders, and tell sitters when a job is filled or canceled.
        We do not sell, rent or share phone numbers or any other information with third parties or affiliates for marketing
        or promotional purposes. Text messaging opt-in data and consent are never shared with third parties. Messages are sent
        through our SMS provider (Twilio) solely to deliver them.
      </p>
      <h2>Text messages</h2>
      <p>
        Sitters receive texts only after texting JOIN to the Phone Tree number. Message frequency varies with how often jobs
        come up. Message and data rates may apply. Reply HELP for help and STOP to stop all messages at any time.
      </p>
      <h2>Deleting your information</h2>
      <p>
        Reply STOP, or email <a href="mailto:marketergraham@gmail.com">marketergraham@gmail.com</a>, and your information
        will be removed.
      </p>
    </main>
  );
}
