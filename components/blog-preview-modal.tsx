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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold leading-tight pr-6 line-clamp-3">
              {post.title}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-5">
            {/* Cover Image */}
            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-muted -mx-6 -mt-2 mb-6">
              <Image
                src={imageUrl}
                alt={post.title}
                fill
                className="object-cover"
                priority
              />
            </div>

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

            {/* Excerpt */}
            <div className="prose prose-sm max-w-none">
              <p className="text-muted-foreground leading-relaxed text-base">
                {excerpt}
              </p>
            </div>

            {/* Call to Action */}
            <div className="flex gap-3 pt-2">
              <Button asChild className="flex-1 h-11" size="lg">
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
