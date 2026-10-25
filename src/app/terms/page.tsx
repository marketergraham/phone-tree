export const metadata = { title: "Terms · Phone Tree" };

export default function Terms() {
  return (
    <main className="page stack" style={{ maxWidth: 720 }}>
      <h1>Phone Tree messaging terms</h1>
      <p>
        <strong>Program:</strong> Phone Tree sends babysitting job offers from one family to babysitters they know personally,
        plus booking confirmations, reminders, and notices when a job is filled or canceled.
      </p>
      <p>
        <strong>Opting in:</strong> text JOIN to the Phone Tree number. You&apos;ll get a confirmation text.
      </p>
      <p>
        <strong>Replies:</strong> 1 to take a job, 2 if you can&apos;t, 3 for maybe, 4 to be a backup, DROP to cancel a booking.
      </p>
      <p>
        <strong>Frequency:</strong> varies with how often jobs come up, typically a few messages a week.
      </p>
      <p>
        <strong>Costs:</strong> Message and data rates may apply.
      </p>
      <p>
        <strong>Help and opting out:</strong> reply <strong>HELP</strong> for help. Reply <strong>STOP</strong> at any time to stop all
        messages. Carriers are not liable for delayed or undelivered messages.
      </p>
      <p>
        <strong>Support:</strong> reply <strong>HELP</strong> to the Phone Tree number, or email{" "}
        <a href="mailto:marketergraham@gmail.com">marketergraham@gmail.com</a>.
      </p>
      <p>
        <strong>Privacy:</strong> see the <a href="/privacy">privacy policy</a>.
      </p>
    </main>
  );
}
