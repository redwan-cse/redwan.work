"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, ExternalLink, Tag } from "lucide-react"
import Image from "next/image"
import { formatDistanceToNow } from "date-fns"

interface BlogPost {
  id: string
  title: string
  content: string
  url: string
  published: string
  author?: string
  labels?: string[]
}

interface BlogPreviewModalProps {
  post: BlogPost
  imageUrl: string
  excerpt: string
  children: React.ReactNode
}

export function BlogPreviewModal({ post, imageUrl, excerpt, children }: BlogPreviewModalProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {children}
      </div>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 [&>button]:hidden border-0 shadow-2xl">
          {/* Cover Image - Full Width */}
          <div className="relative w-full aspect-video overflow-hidden bg-muted rounded-t-xl">
            <Image
              src={imageUrl}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <DialogHeader className="space-y-4">
              <DialogTitle className="text-2xl md:text-3xl font-bold leading-tight">
                {post.title}
              </DialogTitle>

              {/* Meta Information */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <time>
                    {formatDistanceToNow(new Date(post.published), { addSuffix: true })}
                  </time>
                </div>
                
                {post.labels && post.labels.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-wrap gap-2">
                      {post.labels.slice(0, 3).map((label) => (
                        <Badge key={label} variant="secondary" className="text-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DialogHeader>

            {/* Excerpt */}
            <p className="text-muted-foreground leading-relaxed text-base pb-2">
              {excerpt.slice(0, 250)}{excerpt.length > 250 ? '...' : ''}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-row gap-3 pt-4">
              <Button asChild className="h-11 flex-1" size="lg">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2"
                >
                  Read Full Article
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button 
                variant="outline" 
                className="h-11 px-6" 
                size="lg"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
