import { Link } from 'react-router-dom';
import LegalShell from './LegalShell';

export default function PrivacyPolicy() {
  return (
    <LegalShell eyebrow="ECHOO · LEGAL" title="Privacy Policy" updated="October 6, 2026">
      <section className="echoo-legal-intro">
        <p>
          Echoo is an audio platform for live broadcasts, recordings, listening, chat and creator communities.
          This policy explains what information Echoo handles when you use the web app, mobile app or desktop app,
          why that information is needed, and the choices available to you.
        </p>
      </section>

      <section>
        <h2>1. Information Echoo handles</h2>
        <h3>Account and profile information</h3>
        <p>
          When you create an account, Echoo can receive information such as your display name, username, email
          address, password credentials in protected hashed form, profile image, bio and account preferences.
        </p>
        <h3>Listening and community activity</h3>
        <p>
          Echoo can store activity needed to provide features you choose to use, including follows, saved audio,
          playlists, listening history and progress, notifications, reactions, comments and live-room chat.
        </p>
        <h3>Creator content</h3>
        <p>
          If you use Creator features, Echoo can process channel information, broadcast details, uploaded artwork,
          live audio, recordings and any transcript or publishing information you choose to create. Visibility
          settings determine whether creator content is public, follower-only or private.
        </p>
        <h3>Technical and security information</h3>
        <p>
          Echoo can process device, browser, connection, request and security information needed to operate the
          service, protect accounts, diagnose failures, enforce rate limits and keep live sessions reliable.
        </p>
      </section>

      <section>
        <h2>2. Live audio and recordings</h2>
        <p>
          Echoo uses LiveKit for realtime live-audio transport. When a creator starts a broadcast, audio is sent
          through the live service so listeners can hear it. A creator broadcast may also be recorded for replay
          and saved to Echoo&apos;s configured recording storage. Echoo does not require an account for every public
          listening link, but signed-in features such as follows, libraries and account-scoped chat actions use an
          Echoo identity.
        </p>
        <p>
          Creator device recovery copies can also exist locally on the creator&apos;s device. Those local copies are
          controlled by the device and its owner, not by a public Echoo profile.
        </p>
      </section>

      <section>
        <h2>3. How Echoo uses information</h2>
        <p>Echoo uses information as needed to operate and protect the product. That includes:</p>
        <ul>
          <li>creating and securing accounts and authenticated sessions;</li>
          <li>delivering live audio, recordings, libraries, follows, chat and creator tools;</li>
          <li>remembering settings and playback choices;</li>
          <li>sending account or service messages when those features are configured and enabled;</li>
          <li>preventing abuse, investigating failures and keeping the service reliable; and</li>
          <li>responding to support requests you choose to send.</li>
        </ul>
      </section>

      <section>
        <h2>4. Service providers</h2>
        <p>
          Echoo relies on infrastructure providers to run parts of the service. Depending on the deployed feature,
          this can include LiveKit for realtime audio, Resend for transactional email, database and hosting
          infrastructure, and private or S3-compatible storage for recordings. These services receive the
          information needed for the function they provide.
        </p>
      </section>

      <section>
        <h2>5. Public content and other users</h2>
        <p>
          Information you intentionally publish can be visible to other people. For example, a public channel,
          broadcast, recording, profile name or public chat contribution may be shown as part of the Echoo
          experience. Before publishing creator content, check the visibility setting you want.
        </p>
      </section>

      <section>
        <h2>6. Information stored on your device</h2>
        <p>
          Echoo&apos;s web and desktop experiences can keep session and preference information in local browser or
          application storage. Offline listening can use device cache storage. On supported iOS and Android builds,
          Echoo stores account session tokens using the operating system&apos;s secure storage through Expo
          SecureStore. Clearing app or browser storage can remove device-only information.
        </p>
      </section>

      <section>
        <h2>7. Retention</h2>
        <p>
          Echoo keeps account and product information for as long as it is needed to provide the service, preserve
          content you chose to keep, maintain security and reliability, or meet legal obligations. Retention can
          differ by data type. Technical logs, backups or records required for security or legal reasons may remain
          for a limited period after other account data is removed.
        </p>
      </section>

      <section>
        <h2>8. Deleting your account</h2>
        <p>
          You can start permanent account deletion from Echoo&apos;s account controls or from the public
          <Link to="/delete-account"> Delete Account page</Link>. Echoo requires account authentication and your
          current password before completing a deletion from the signed-in service.
        </p>
        <p>
          Account deletion removes the active Echoo account record. Some information may be retained when required
          for security, legal obligations, fraud prevention, backups or the integrity of content and conversations.
          Retained information is limited to those purposes and is not used to keep an active Echoo account.
        </p>
      </section>

      <section>
        <h2>9. Security</h2>
        <p>
          Echoo uses measures such as authenticated API access, password hashing, restricted server credentials,
          protected media access and rate limits. No online service can guarantee absolute security, so users should
          also protect their password and devices and avoid sharing authentication codes or credentials.
        </p>
      </section>

      <section>
        <h2>10. Your choices</h2>
        <p>
          You can update profile and notification preferences from Settings, choose creator-content visibility,
          sign out of devices, clear device storage and request account deletion. Where applicable law gives you
          additional rights to access, correct, restrict or object to processing of your personal information, you
          can use Echoo&apos;s support path to make that request.
        </p>
      </section>

      <section>
        <h2>11. Children</h2>
        <p>
          Echoo is not intended to be used by a child who cannot lawfully consent to the processing of their
          personal information in their jurisdiction. A parent or guardian who believes a child provided personal
          information without the required permission should contact Echoo through the support path described below.
        </p>
      </section>

      <section>
        <h2>12. Changes to this policy</h2>
        <p>
          If Echoo changes this policy, the updated version will be published at this URL with a new last-updated
          date. Material product changes should be reflected here rather than hidden behind unrelated wording.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          For privacy questions, use <strong>Help &amp; support</strong> inside Echoo. Echoo does not currently
          publish an unverified support mailbox on this page. The official service website is
          {' '}<a href="https://echoo.digi02.org">echoo.digi02.org</a>.
        </p>
      </section>
    </LegalShell>
  );
}
