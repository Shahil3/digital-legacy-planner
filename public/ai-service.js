/**
 * AI Service for Digital Legacy
 * Add this file to your public/ folder
 */

class DigitalLegacyAI {
    constructor() {
      this.categories = {
        banking: ['bank', 'account', 'demat', 'savings', 'current', 'fd', 'hdfc', 'icici', 'sbi'],
        insurance: ['insurance', 'policy', 'lic', 'health', 'life', 'term'],
        investments: ['mutual fund', 'stocks', 'shares', 'zerodha', 'groww', 'sip', 'portfolio'],
        property: ['property', 'land', 'house', 'flat', 'deed', 'registry'],
        government: ['aadhaar', 'pan', 'passport', 'driving', 'voter', 'government'],
        digital: ['email', 'gmail', 'facebook', 'instagram', 'twitter', 'linkedin', 'social'],
        crypto: ['bitcoin', 'crypto', 'wallet', 'binance', 'wazirx', 'seed phrase', 'ethereum'],
        passwords: ['password', 'credential', 'login', 'access'],
        personal: ['photos', 'videos', 'memories', 'family', 'personal']
      };
    }
  
    /**
     * Auto-categorize a document/artifact
     */
    categorizeArtifact(description) {
      const descLower = description.toLowerCase();
      const scores = {};
  
      for (const [category, keywords] of Object.entries(this.categories)) {
        scores[category] = 0;
        for (const keyword of keywords) {
          if (descLower.includes(keyword)) {
            scores[category]++;
          }
        }
      }
  
      const bestCategory = Object.entries(scores).reduce((a, b) => 
        scores[a[0]] > scores[b[0]] ? a : b
      )[0];
  
      const confidence = scores[bestCategory] > 0 ? 
        Math.min((scores[bestCategory] / 3) * 100, 100) : 0;
  
      return {
        category: bestCategory,
        confidence: Math.round(confidence),
        suggestedTags: this._generateTags(descLower)
      };
    }
  
    /**
     * Analyze user's digital legacy and provide recommendations
     */
    analyzeUserEstate(artifacts) {
      const analysis = {
        totalArtifacts: artifacts.length,
        coverage: {},
        gaps: [],
        recommendations: [],
        riskScore: 0
      };
  
      // Check which categories are covered
      const categoriesCovered = new Set();
      artifacts.forEach(a => {
        const cat = this.categorizeArtifact(a.description);
        categoriesCovered.add(cat.category);
      });
  
      // Calculate coverage percentage
      const totalCategories = Object.keys(this.categories).length;
      const coveragePercent = Math.round((categoriesCovered.size / totalCategories) * 100);
      
      analysis.coverage = {
        covered: categoriesCovered.size,
        total: totalCategories,
        percentage: coveragePercent
      };
  
      // Identify critical gaps
      if (!categoriesCovered.has('banking')) {
        analysis.gaps.push({
          category: 'banking',
          priority: 'CRITICAL',
          message: 'No bank accounts documented. This is essential for family access to savings.'
        });
      }
  
      if (!categoriesCovered.has('insurance')) {
        analysis.gaps.push({
          category: 'insurance',
          priority: 'HIGH',
          message: 'No insurance policies recorded. Your family may miss out on claims.'
        });
      }
  
      if (!categoriesCovered.has('investments')) {
        analysis.gaps.push({
          category: 'investments',
          priority: 'HIGH',
          message: 'No investment accounts documented. Demat/mutual funds may be inaccessible.'
        });
      }
  
      if (!categoriesCovered.has('digital')) {
        analysis.gaps.push({
          category: 'digital',
          priority: 'MEDIUM',
          message: 'No digital accounts recorded. Consider adding Gmail, social media accounts.'
        });
      }
  
      // Check for artifacts without nominees
      const withoutNominees = artifacts.filter(a => !a.nomineeCount || a.nomineeCount === 0);
      if (withoutNominees.length > 0) {
        analysis.gaps.push({
          category: 'nominees',
          priority: 'CRITICAL',
          message: `${withoutNominees.length} artifact(s) have no nominees. Add nominees immediately.`
        });
      }
  
      // Generate recommendations
      analysis.recommendations = this._generateRecommendations(categoriesCovered, artifacts);
  
      // Calculate risk score (0-100, lower is better)
      let risk = 100 - coveragePercent;
      if (withoutNominees.length > 0) risk += 20;
      if (artifacts.length < 3) risk += 15;
      analysis.riskScore = Math.min(100, Math.max(0, risk));
  
      return analysis;
    }
  
    /**
     * Generate smart recommendations
     */
    _generateRecommendations(categoriesCovered, artifacts) {
      const recommendations = [];
  
      if (!categoriesCovered.has('banking')) {
        recommendations.push({
          priority: 'HIGH',
          icon: '🏦',
          title: 'Add Bank Account Details',
          description: 'Document your bank accounts (HDFC, SBI, ICICI, etc.) with account numbers and branch details.',
          action: 'Add Banking Info',
          estimatedTime: '5 min'
        });
      }
  
      if (!categoriesCovered.has('investments')) {
        recommendations.push({
          priority: 'HIGH',
          icon: '📊',
          title: 'Document Investment Accounts',
          description: 'Add your Demat accounts (Zerodha, Groww), mutual funds, and stock portfolios.',
          action: 'Add Investments',
          estimatedTime: '10 min'
        });
      }
  
      if (!categoriesCovered.has('insurance')) {
        recommendations.push({
          priority: 'MEDIUM',
          icon: '🛡️',
          title: 'Record Insurance Policies',
          description: 'Add life insurance, health insurance, and term insurance policy details.',
          action: 'Add Insurance',
          estimatedTime: '7 min'
        });
      }
  
      if (!categoriesCovered.has('crypto')) {
        recommendations.push({
          priority: 'LOW',
          icon: '₿',
          title: 'Secure Cryptocurrency Assets',
          description: 'If you own crypto, add wallet recovery phrases and exchange account details.',
          action: 'Add Crypto',
          estimatedTime: '5 min'
        });
      }
  
      if (artifacts.length < 5) {
        recommendations.push({
          priority: 'MEDIUM',
          icon: '✅',
          title: 'Complete Your Digital Estate',
          description: 'Most people have 10-15 important digital assets. Review what you might be missing.',
          action: 'Review Completeness',
          estimatedTime: '15 min'
        });
      }
  
      // Check for single nominee artifacts
      const singleNominee = artifacts.filter(a => a.nomineeCount === 1);
      if (singleNominee.length > 2) {
        recommendations.push({
          priority: 'MEDIUM',
          icon: '👥',
          title: 'Add Backup Nominees',
          description: `${singleNominee.length} artifacts have only one nominee. Add backup nominees for redundancy.`,
          action: 'Update Nominees',
          estimatedTime: '5 min'
        });
      }
  
      return recommendations;
    }
  
    /**
     * Generate tags for an artifact
     */
    _generateTags(description) {
      const tags = [];
  
      if (description.includes('bank') || description.includes('account')) tags.push('financial');
      if (description.includes('investment') || description.includes('stock')) tags.push('investment');
      if (description.includes('crypto') || description.includes('bitcoin')) tags.push('cryptocurrency');
      if (description.includes('urgent') || description.includes('important')) tags.push('urgent');
      if (description.includes('family') || description.includes('spouse')) tags.push('family');
      if (description.includes('property') || description.includes('land')) tags.push('real-estate');
      if (description.includes('insurance') || description.includes('policy')) tags.push('insurance');
  
      return [...new Set(tags)];
    }
  
    /**
     * Get quick insight about an artifact
     */
    getArtifactInsight(artifact) {
      const category = this.categorizeArtifact(artifact.description);
      
      let insight = '';
      if (category.category === 'banking' && artifact.nomineeCount === 0) {
        insight = '⚠️ Critical: Bank accounts need nominees for legal heir access.';
      } else if (category.category === 'crypto' && artifact.nomineeCount < 2) {
        insight = '⚠️ Important: Crypto needs multiple backup nominees to prevent loss.';
      } else if (artifact.nomineeCount === 0) {
        insight = '⚠️ Add at least one nominee to ensure access.';
      } else if (artifact.nomineeCount === 1) {
        insight = '💡 Consider adding a backup nominee for redundancy.';
      } else {
        insight = '✅ Well configured with multiple nominees.';
      }
  
      return {
        category: category.category,
        confidence: category.confidence,
        insight: insight,
        tags: category.suggestedTags
      };
    }
  }
  
  // Export for browser
  if (typeof window !== 'undefined') {
    window.DigitalLegacyAI = DigitalLegacyAI;
  }
