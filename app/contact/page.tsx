import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Mail, MessageSquare, Send} from "lucide-react"

export default function Contact() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-center text-4xl font-bold">Get in Touch</h1>
        <Card>
            <CardHeader className="text-center">
            <CardTitle></CardTitle>
            <CardDescription>
              Fill out the form below and I&apos;ll get back to you as soon as possible.
            </CardDescription>
            </CardHeader>
          <CardContent>
            <form className="space-y-6">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium">
                      Name
                    </label>
                    <Input id="name" placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input id="email" type="email" placeholder="Your email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="subject" className="text-sm font-medium">
                    Subject
                  </label>
                  <Input id="subject" placeholder="How can I help you?" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium">
                    Message
                  </label>
                  <Textarea
                    id="message"
                    placeholder="Tell me about your project..."
                    className="min-h-[150px]"
                  />
                </div>
              </div>
              <Button className="w-full" size="lg">
                <Send className="mr-2 h-4 w-4" />
                Send Message
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <Mail className="h-8 w-8 text-primary" />
              <div>
              <h3 className="font-semibold">Email</h3>
              <p className="text-sm text-muted-foreground">
                <a href="mailto:contact@redwan.work" className="hover:underline">
                contact@redwan.work
                </a>
              </p>
              </div>
            </CardContent>
            </Card>
            <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <MessageSquare className="h-8 w-8 text-primary" />
              <div>
              <h3 className="font-semibold">Book a Consultation</h3>
              <p className="text-sm text-muted-foreground">
                <a href="https://calendly.com/redwancse/consultation" className="hover:underline" target="_blank" rel="noopener noreferrer">
                Schedule a meeting
                </a>
              </p>
              </div>
            </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}