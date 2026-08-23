import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MessageCircle, Calendar, ArrowRight } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"
import EnhancedContactForm from "@/components/enhanced-contact-form"

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Md Redwan Ahmed for cybersecurity consulting, penetration testing, and security services.",
  alternates: { canonical: "/contact" },
}

export default function Contact() {
  return (
    <div className="container py-12 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            Get in <span className="text-primary">Touch</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Have a security concern or need expert consultation? 
            I&apos;m here to help protect your digital assets.
          </p>
        </div>

        {/* Quick Contact Options */}
        <div className="grid gap-6 md:grid-cols-2 mb-12">
          {/* WhatsApp Card */}
          <Card className="relative overflow-hidden border-2 border-green-500/20 hover:border-green-500/40 transition-all hover:shadow-lg group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/10 to-transparent rounded-full blur-2xl group-hover:scale-150 transition-transform" />
            <CardHeader className="relative">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl mb-1.5">WhatsApp for Urgent Matters</CardTitle>
                  <CardDescription className="text-sm">
                    For immediate assistance or quick questions
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative pb-6">
              <Link 
                href="https://wa.me/8801776387624"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button 
                  variant="outline" 
                  className="w-full group/btn border-green-500/30 hover:border-green-500 hover:bg-green-500/10 transition-all"
                >
                  <span className="text-2xl mr-2">💬</span>
                  <span className="font-semibold">Chat on WhatsApp</span>
                  <ArrowRight className="ml-auto h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Cal.com Card */}
          <Card className="relative overflow-hidden border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl group-hover:scale-150 transition-transform" />
            <CardHeader className="relative">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl mb-1.5">Schedule a Consultation</CardTitle>
                  <CardDescription className="text-sm">
                    Book a time that works best for you
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <Link 
                href="https://cal.com/redwancse"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button 
                  variant="outline" 
                  className="w-full group/btn border-primary/30 hover:border-primary hover:bg-primary/10 transition-all"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  <span className="font-semibold">Book on Cal.com</span>
                  <ArrowRight className="ml-auto h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Request a Service</CardTitle>
            <CardDescription className="text-base max-w-2xl mx-auto">
              Fill out the form below with detailed information about your needs. I&apos;ll review your request and get back to you within 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EnhancedContactForm />
          </CardContent>
        </Card>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            All communications are confidential and protected under professional cybersecurity standards.
          </p>
        </div>
      </div>
    </div>
  )
}