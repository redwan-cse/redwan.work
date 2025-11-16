export const metadata = {
  title: "Data & Privacy - Md Redwan Ahmed",
  description: "Learn how we collect, store, and protect your data in accordance with privacy best practices.",
}

export default function PrivacyPage() {
  return (
    <div className="container py-12 px-4 md:px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">
          Data & <span className="text-primary">Privacy</span>
        </h1>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="text-lg text-muted-foreground mb-8">
            Your privacy and data security are important to me. This page will describe in detail 
            how I collect, store, use, and protect your personal information when you interact with 
            this website or use the contact form.
          </p>

          <div className="bg-muted/50 border border-primary/20 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-3">🚧 Page Under Construction</h2>
            <p className="text-muted-foreground mb-0">
              I'm currently preparing a comprehensive privacy policy that will cover:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              <li>✓ What information is collected via the contact form</li>
              <li>✓ How your data is stored securely (Google Sheets with restricted access)</li>
              <li>✓ How your information is used (only for responding to your inquiry)</li>
              <li>✓ Data retention policies and your rights to access/delete your data</li>
              <li>✓ Technical measures taken to protect your information</li>
              <li>✓ Cookie usage and analytics (if any)</li>
            </ul>
          </div>

          <h2 className="text-2xl font-semibold mt-8 mb-4">In the Meantime</h2>
          <p className="text-muted-foreground">
            If you have any questions about how your data is handled, please don't hesitate to 
            reach out to me directly at{" "}
            <a href="mailto:contact@redwan.work" className="text-primary hover:underline font-medium">
              contact@redwan.work
            </a>
            {" "}or via{" "}
            <a 
              href="https://wa.me/8801776387624" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              WhatsApp
            </a>.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Current Data Practices (Summary)</h2>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-semibold text-foreground mb-2">What We Collect:</h3>
              <p>
                When you submit the contact form, I collect your name, email, country, phone number 
                (optional), project details, and technical metadata (device type, browser information) 
                to help me understand and respond to your inquiry effectively.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">How We Use It:</h3>
              <p>
                Your information is used solely to respond to your inquiry, provide the services you 
                request, and maintain records of our communication. I will never sell, rent, or share 
                your data with third parties without your explicit consent.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Security:</h3>
              <p>
                All data is transmitted securely via HTTPS and stored in password-protected systems 
                with restricted access. Only authorized personnel can view your submitted information.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Your Rights:</h3>
              <p>
                You have the right to request access to, correction of, or deletion of your personal 
                data at any time. Simply contact me using the information above.
              </p>
            </div>
          </div>

          <div className="mt-12 p-6 bg-primary/10 border border-primary/30 rounded-lg">
            <p className="text-sm text-muted-foreground mb-0">
              <strong className="text-foreground">Last Updated:</strong> November 2025<br />
              <strong className="text-foreground">Status:</strong> Placeholder - Full policy coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
