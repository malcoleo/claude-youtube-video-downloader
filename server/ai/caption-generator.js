// server/ai/caption-generator.js
const fs = require('fs').promises;
const path = require('path');

class AICaptionGenerator {
  constructor() {
    this.templatesDir = path.join(__dirname, 'caption-templates');
    this.ensureTemplatesDir();
  }

  async ensureTemplatesDir() {
    try {
      await fs.mkdir(this.templatesDir, { recursive: true });
    } catch (error) {
      console.error('Error creating templates directory:', error);
    }
  }

  /**
   * Generate captions from transcript data
   * @param {Object} transcript - Transcript with qaPairs array
   * @param {Object} options - Generation options
   * @returns {Object} Generated captions with multiple variants
   */
  async generateCaptions(transcript, options = {}) {
    const {
      style = 'engaging', // engaging, professional, casual, educational
      platform = 'multi', // youtube, instagram, tiktok, linkedin, multi
      includeHashtags = true,
      includeCTA = true,
      tone = 'friendly', // friendly, authoritative, witty, inspirational
      maxLength = 2200, // Character limit
      language = 'en'
    } = options;

    // Extract key content from transcript
    const keyPoints = this.extractKeyPoints(transcript);
    const mainTopics = this.identifyTopics(transcript);
    const hooks = this.generateHooks(keyPoints, tone);
    const summaries = this.generateSummaries(keyPoints, style);

    // Generate caption variants
    const variants = [];

    for (let i = 0; i < Math.min(3, hooks.length); i++) {
      for (let j = 0; j < Math.min(2, summaries.length); j++) {
        const caption = this.buildCaption({
          hook: hooks[i],
          summary: summaries[j],
          keyPoints: keyPoints.slice(0, 3),
          topics: mainTopics,
          style,
          platform,
          includeHashtags,
          includeCTA,
          tone,
          maxLength,
          language
        });

        if (caption.length <= maxLength) {
          variants.push({
            text: caption,
            characterCount: caption.length,
            style,
            tone,
            estimatedEngagement: this.estimateEngagement(caption, platform)
          });
        }
      }
    }

    // Generate hashtags
    const hashtags = includeHashtags ? this.generateHashtags(mainTopics, platform) : [];

    // Sort variants by estimated engagement
    variants.sort((a, b) => b.estimatedEngagement.score - a.estimatedEngagement.score);

    return {
      variants,
      hashtags,
      keyPoints,
      topics: mainTopics,
      recommendedVariant: variants[0] || null
    };
  }

  extractKeyPoints(transcript) {
    const keyPoints = [];

    if (transcript.qaPairs) {
      for (const qa of transcript.qaPairs) {
        // Extract the most important sentence from each answer
        const answerSentences = qa.answerText.split(/[.!?]+/).filter(s => s.trim().length > 20);

        if (answerSentences.length > 0) {
          keyPoints.push({
            text: answerSentences[0].trim(),
            timestamp: qa.questionStart,
            relevance: qa.score / 100
          });
        }
      }
    }

    // Sort by relevance and return top 5
    return keyPoints
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5);
  }

  identifyTopics(transcript) {
    const topics = new Set();
    const commonWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also', 'now', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how']);

    const allText = transcript.qaPairs
      ? transcript.qaPairs.map(qa => `${qa.questionText} ${qa.answerText}`).join(' ').toLowerCase()
      : '';

    const words = allText.replace(/[^\w\s]/g, '').split(/\s+/);
    const wordFreq = {};

    for (const word of words) {
      if (word.length > 3 && !commonWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }

    // Get top 10 most frequent meaningful words
    Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([word]) => topics.add(word));

    return Array.from(topics);
  }

  generateHooks(keyPoints, tone) {
    const hooks = [];

    const hookTemplates = {
      friendly: [
        "Ever wondered {}?",
        "Here's something interesting: {}",
        "Let me share this with you: {}",
        "You're going to love this: {}",
        "Quick story time about {}"
      ],
      authoritative: [
        "The truth about {}:",
        "Here's what experts say about {}:",
        "The reality of {} that nobody talks about:",
        "Fact: {}",
        "Let's settle this once and for all: {}"
      ],
      witty: [
        "Plot twist: {}",
        "Unpopular opinion: {}",
        "Hot take: {}",
        "Confession: {}",
        "Remember when we all thought {}? Yeah, about that..."
      ],
      inspirational: [
        "This changed everything for me: {}",
        "What if I told you {}?",
        "The moment I realized {}:",
        "Your reminder that {}",
        "Today's lesson: {}"
      ]
    };

    const templates = hookTemplates[tone] || hookTemplates.friendly;

    for (const point of keyPoints.slice(0, 3)) {
      for (const template of templates) {
        const shortenedPoint = point.text.length > 50
          ? point.text.substring(0, 47) + '...'
          : point.text;

        hooks.push({
          text: template.replace('{}', shortenedPoint),
          type: 'question',
          strength: this.calculateHookStrength(template, point.text)
        });
      }
    }

    // Sort by strength and return top 5
    return hooks.sort((a, b) => b.strength - a.strength).slice(0, 5);
  }

  calculateHookStrength(template, content) {
    let strength = 50;

    // Questions tend to perform better
    if (template.includes('?')) strength += 15;

    // Personal pronouns increase engagement
    if (template.includes('you') || template.includes('your')) strength += 10;

    // Strong words
    const strongWords = ['truth', 'reality', 'changed', 'everything', 'never', 'always'];
    for (const word of strongWords) {
      if (template.toLowerCase().includes(word)) strength += 5;
    }

    return strength;
  }

  generateSummaries(keyPoints, style) {
    const summaries = [];

    const styleGuides = {
      engaging: {
        connector: ' ➜ ',
        emoji: true,
        sentenceStructure: 'varied'
      },
      professional: {
        connector: '. ',
        emoji: false,
        sentenceStructure: 'formal'
      },
      casual: {
        connector: ' + ',
        emoji: true,
        sentenceStructure: 'conversational'
      },
      educational: {
        connector: '\n\n',
        emoji: false,
        sentenceStructure: 'informative'
      }
    };

    const guide = styleGuides[style] || styleGuides.engaging;
    const emojis = ['💡', '🎯', '✨', '📌', '🔥', '💪', '🚀', '📈'];

    // Create summary from key points
    const points = keyPoints.slice(0, 3).map(p => p.text);

    let summary = points.join(guide.connector);

    if (guide.emoji) {
      summary = emojis[Math.floor(Math.random() * emojis.length)] + ' ' + summary;
    }

    summaries.push(summary);

    return summaries;
  }

  buildCaption(components) {
    const {
      hook,
      summary,
      keyPoints,
      topics,
      style,
      platform,
      includeHashtags,
      includeCTA,
      tone,
      maxLength,
      language
    } = components;

    let caption = '';

    // Add hook
    caption += hook.text + '\n\n';

    // Add summary
    caption += summary + '\n\n';

    // Add key points as bullet points
    if (keyPoints.length > 0) {
      caption += 'Key takeaways:\n';
      keyPoints.forEach((point, i) => {
        caption += `• ${point.text}\n`;
      });
      caption += '\n';
    }

    // Add CTA
    if (includeCTA) {
      caption += this.generateCTA(platform, tone) + '\n\n';
    }

    // Add hashtags
    if (includeHashtags) {
      const hashtags = this.generateHashtags(topics, platform);
      caption += hashtags.join(' ');
    }

    // Trim if too long
    if (caption.length > maxLength) {
      caption = caption.substring(0, maxLength - 3) + '...';
    }

    return caption.trim();
  }

  generateCTA(platform, tone) {
    const ctas = {
      youtube: [
        'Subscribe for more content like this!',
        'Hit that subscribe button if you found this helpful!',
        'Drop a comment below with your thoughts!',
        'Like and subscribe if you learned something new!'
      ],
      instagram: [
        'Save this for later! 📌',
        'Tag someone who needs to see this!',
        'Double tap if you agree! ❤️',
        'Share this to your story!'
      ],
      tiktok: [
        'Follow for part 2!',
        'Duet this if you agree!',
        'Save this before it\'s gone!',
        'Share with your friends!'
      ],
      linkedin: [
        'What are your thoughts on this? Comment below.',
        'Repost to share with your network.',
        'Connect with me for more insights.',
        'Follow for regular industry updates.'
      ]
    };

    const platformCtas = ctas[platform] || ctas.youtube;
    return platformCtas[Math.floor(Math.random() * platformCtas.length)];
  }

  generateHashtags(topics, platform) {
    const hashtags = [];

    // Platform-specific hashtags
    const platformTags = {
      youtube: ['#shorts', '#youtube', '#viral'],
      instagram: ['#reels', '#instagram', '#trending'],
      tiktok: ['#fyp', '#foryou', '#viral', '#tiktok'],
      linkedin: ['#professional', '#industry', '#insights'],
      multi: ['#viral', '#trending', '#content']
    };

    // Add platform tags
    const tags = platformTags[platform] || platformTags.multi;
    hashtags.push(...tags.slice(0, 3));

    // Add topic-based hashtags
    for (const topic of topics.slice(0, 5)) {
      hashtags.push(`#${topic.replace(/\s+/g, '')}`);
    }

    // Add niche-specific tags based on detected topics
    const nicheTags = {
      tech: ['#technology', '#tech', '#innovation'],
      business: ['#business', '#entrepreneur', '#success'],
      education: ['#education', '#learning', '#knowledge'],
      entertainment: ['#entertainment', '#fun', '#comedy'],
      lifestyle: ['#lifestyle', '#motivation', '#inspiration']
    };

    for (const [niche, tags] of Object.entries(nicheTags)) {
      if (topics.some(t => t.toLowerCase().includes(niche))) {
        hashtags.push(...tags);
      }
    }

    // Limit to platform-specific max
    const maxHashtags = {
      instagram: 30,
      tiktok: 5,
      youtube: 3,
      linkedin: 5
    };

    return hashtags.slice(0, maxHashtags[platform] || 10);
  }

  estimateEngagement(caption, platform) {
    const text = caption.toLowerCase();
    let score = 50; // Base score
    const factors = [];

    // Question marks increase engagement (curiosity)
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount > 0) {
      score += Math.min(questionCount * 5, 15);
      factors.push('Questions create curiosity');
    }

    // Emojis increase engagement
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
    if (emojiCount > 0 && emojiCount <= 5) {
      score += Math.min(emojiCount * 3, 12);
      factors.push('Good emoji usage');
    } else if (emojiCount > 5) {
      score -= 5;
      factors.push('Too many emojis');
    }

    // Call-to-action phrases
    const ctaPhrases = ['subscribe', 'follow', 'comment', 'share', 'like', 'save', 'tag', 'click'];
    const hasCTA = ctaPhrases.some(phrase => text.includes(phrase));
    if (hasCTA) {
      score += 10;
      factors.push('Includes call-to-action');
    }

    // Optimal length
    if (caption.length >= 100 && caption.length <= 500) {
      score += 5;
      factors.push('Optimal length');
    } else if (caption.length < 50) {
      score -= 10;
      factors.push('Too short');
    } else if (caption.length > 1000) {
      score -= 5;
      factors.push('May be too long');
    }

    return {
      score: Math.min(Math.max(score, 0), 100),
      factors
    };
  }

  /**
   * Generate caption variants from existing Q&A transcript
   * Quick method for on-the-fly generation
   */
  async quickGenerate(transcript, platform = 'multi') {
    return this.generateCaptions(transcript, {
      style: 'engaging',
      platform,
      includeHashtags: true,
      includeCTA: true,
      tone: 'friendly',
      maxLength: platform === 'twitter' ? 280 : 2200
    });
  }
}

module.exports = AICaptionGenerator;
