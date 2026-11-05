import type { Metadata } from "next";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How SWTTR collects, uses, stores, and shares information, and how to contact us about your data.",
};

// Data-flow audit and release dependencies: docs/privacy.md.
export default function PrivacyPage() {
  return (
    <PageLayout>
      <article className="w-full max-w-2xl space-y-8 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground">
        <header className="space-y-3">
          <h1 className="text-title font-semibold text-foreground md:text-title-lg">Privacy Policy</h1>
          <p>Last updated: <time dateTime="2026-11-01">November 1, 2026</time></p>
          <p>
            SWTTR helps you choose layers and plan outdoor trips. This policy covers the SWTTR
            website and its iPhone and Mac apps. We use information to provide these features,
            keep the service working, and respond to support requests. SWTTR does not sell your
            personal information or use it for advertising or tracking you across other apps and websites.
          </p>
        </header>

        <section aria-labelledby="privacy-information" className="space-y-3">
          <h2 id="privacy-information">Information you provide</h2>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <strong>Account.</strong> Clerk handles sign-in and stores your email address, name,
              and account details, including a profile image if you provide one. Your Clerk user ID
              links your account to your saved SWTTR data. Clerk also processes sign-in and session
              information to authenticate you and protect your account.
            </li>
            <li>
              <strong>Preferences and body measurements.</strong> We store your temperature sensitivity
              and default activity. Height and weight are optional and are used to personalize thermal
              recommendations. Signed-in preferences are saved to your account; preferences can also
              be kept on your device. Temperature units are saved on the device.
            </li>
            <li>
              <strong>Wardrobe.</strong> We store the gear you add, custom item details, and your choices
              about which items to use, so we can recommend layers from your wardrobe and build packing lists.
            </li>
            <li>
              <strong>Trips and crew.</strong> We store trip names, dates, destinations, lodging and access
              locations, activities, crew display names and membership, saved outfits, packing choices,
              shared gear, notes, and any route or conditions information you save. These records support
              planning and coordination. Shared trip details, crew names, saved outfits, and shared gear
              are visible to other people with access to that trip. Invite links let recipients view an
              invitation and join; share them only with people you intend to invite.
            </li>
            <li>
              <strong>Support.</strong> If you use our feedback form, we receive the message and any
              contact information you include so we can review feedback or respond. The form is hosted
              by Google Forms. Please leave out passwords, sign-in codes, and information we do not need
              to help you.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-location" className="space-y-3">
          <h2 id="privacy-location">Location and weather</h2>
          <p>
            You can search for a place or choose to use your device&apos;s location. Device location
            requires permission and is requested when you use that feature; SWTTR does not continuously
            track your location in the background. You can deny or revoke permission in your browser or
            device settings and still search for places manually.
          </p>
          <p>
            For weather, coordinates go to SWTTR&apos;s weather API and then to Open-Meteo to get a
            forecast. Place searches go to SWTTR&apos;s geocoding API and then to Open-Meteo as search
            text. We do not send your name, email, or Clerk user ID with those Open-Meteo requests.
            These weather and place-search endpoints do not write the requests to our database.
          </p>
          <p>
            Location can still be stored: your current outing, including coordinates, is kept in the
            browser tab&apos;s session storage so you can return to it. Locations you save in trips or
            outfits are stored in our database and linked to your account or trip. Coordinates can be
            precise enough to identify a particular building or your device&apos;s position.
          </p>
          <p>
            Vercel&apos;s request logs can include URL search parameters, including weather coordinates
            and place-search text. Open-Meteo also logs requests and says its logs may contain coordinates
            and are deleted after 90 days. See{" "}
            <a href="https://vercel.com/docs/logs/runtime">Vercel&apos;s logging documentation</a> and{" "}
            <a href="https://open-meteo.com/en/terms">Open-Meteo&apos;s privacy notice</a>.
          </p>
        </section>

        <section aria-labelledby="privacy-services" className="space-y-3">
          <h2 id="privacy-services">Services that process information</h2>
          <ul className="list-disc space-y-3 pl-5">
            <li><strong>Clerk</strong> provides account management, authentication, and session security.</li>
            <li><strong>Supabase</strong> stores SWTTR preferences, wardrobe items, trips, and related account data.</li>
            <li>
              <strong>Vercel</strong> hosts SWTTR and processes requests and operational logs. This can
              include IP addresses, request URLs, timestamps, browser or app information, response status,
              and diagnostic errors, to deliver and secure the service and investigate problems.
            </li>
            <li><strong>Open-Meteo</strong> provides weather forecasts and general place search.</li>
            <li>
              <strong>Geoapify</strong> receives trip place-search text and nearby destination coordinates
              to find lodging and access points, and route coordinates to calculate driving estimates and routes.
              We do not include your account name, email, or user ID in these requests.
            </li>
            <li>
              <strong>OpenFreeMap</strong> provides the map background. Your device requests map resources
              directly, which exposes your IP address and the map areas requested to that service.
            </li>
            <li><strong>Google Forms</strong> hosts feedback and support messages you choose to submit.</li>
          </ul>
          <p>
            External links, such as product pages, conditions reports, and Apple or Google Maps, open
            services with their own privacy practices. Directions links include the locations needed
            for the route. Externally hosted product images also send ordinary web request information
            to the image host when loaded.
          </p>
        </section>

        <section aria-labelledby="privacy-device" className="space-y-3">
          <h2 id="privacy-device">Cookies and storage on your device</h2>
          <p>
            Clerk uses cookies and session storage to keep you signed in. SWTTR uses local storage for
            preferences, including optional body measurements, and session storage for your outing draft.
            The native apps also keep web session data so sign-in can survive reopening the app. Clearing
            website or app data removes local copies and may sign you out; it does not delete data saved
            to your account. Signing out alone does not erase every local preference or draft.
          </p>
        </section>

        <section aria-labelledby="privacy-deletion" className="space-y-3">
          <h2 id="privacy-deletion">Keeping and deleting your data</h2>
          <p>
            Saved account data is kept so you can return to your wardrobe and trips. You can update
            preferences and remove wardrobe items or trips using the app. Deleting a trip you own
            removes the shared trip for its entire crew, including its plans and saved outfits.
          </p>
          <p>
            To delete your sign-in account, open the account menu, choose <strong>Manage account</strong>,
            then <strong>Delete account</strong>. Currently, that deletes your Clerk account but does
            not automatically remove your saved SWTTR database records. To request deletion of your
            preferences, wardrobe, trip memberships, and trips you own, please{" "}
            <Link href="/faq#contact">contact us</Link>. Include the email address associated with the
            account so we can follow up and verify the request. Removing your owned trips also removes
            them for everyone in their crew.
          </p>
          <p>
            Operational logs and provider backups can remain for their retention periods after active
            data is removed. Vercel log retention depends on the hosting plan and logging configuration;
            Open-Meteo describes a 90-day log retention period. Deleting your account or clearing your
            device does not immediately erase those separate copies.
          </p>
        </section>

        <section aria-labelledby="privacy-contact" className="space-y-3">
          <h2 id="privacy-contact">Questions, requests, and changes</h2>
          <p>
            Use the <Link href="/faq#contact">Contact section of our help page</Link> to ask about
            privacy or request access, correction, or deletion of your information. Include an email
            address if you need a reply. We may need to verify that the information belongs to you
            before acting on a request.
          </p>
          <p>
            We will update this page when our practices change and revise the date above so you can
            see when the policy was last updated.
          </p>
        </section>
      </article>
    </PageLayout>
  );
}
