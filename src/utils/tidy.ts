import { debugLog } from './debug';

interface ContentScore {
	score: number;
	element: Element;
}

export class Tidy {
	private static POSITIVE_PATTERNS = /article|content|main|post|body|text|blog|story/i;
	private static NEGATIVE_PATTERNS = /comment|meta|footer|footnote|foot|nav|sidebar|banner|ad|popup|menu/i;
	private static BLOCK_ELEMENTS = ['div', 'section', 'article', 'main'];
	
	// Add viewport meta tag to simulate mobile view
	private static MOBILE_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';
	
	private static HIDDEN_ELEMENTS_SELECTOR = [
		'[aria-hidden="true"]',
		'[hidden]',
		'[style*="display: none"]',
		'[style*="display:none"]',
		'[style*="visibility: hidden"]',
		'[style*="visibility:hidden"]',
		'.hidden',
		'.invisible'
	].join(',');

	private static originalHTML: string | null = null;
	private static isActive: boolean = false;
	private static MOBILE_WIDTH = 600; // Default mobile viewport width

	private static ALLOWED_ATTRIBUTES = new Set([
		// Essential attributes
		'href',
		'src',
		'srcset',
		'data-src',
		'data-srcset',
		'alt',
		'title',
		'id',
		'class',
		'width',
		'height',
		'colspan',
		'rowspan',
		'headers',
		'aria-label',
		'role',
		'lang'
	]);

	/**
	 * Main entry point - cleans up HTML content and returns the main content
	 */
	static parse(doc: Document) {
		debugLog('Tidy', 'Starting content extraction');
		const startElementCount = doc.getElementsByTagName('*').length;
		debugLog('Tidy', `Initial element count: ${startElementCount}`);

		// Create a deep clone of the document
		const clone = doc.cloneNode(true) as Document;
		
		try {
			// Simulate mobile viewport
			this.simulateMobileViewport(doc);

			// Force media query evaluation
			this.evaluateMediaQueries(doc);

			// Remove hidden elements first
			this.removeHiddenElements(doc);
			
			// Remove common clutter
			this.removeClutter(doc);

			// Find main content
			const mainContent = this.findMainContent(doc);
			if (!mainContent) {
				debugLog('Tidy', 'No main content found');
				return null;
			}

			// Clean up the main content
			this.cleanContent(mainContent);

			const finalElementCount = mainContent.getElementsByTagName('*').length;
			debugLog('Tidy', `Final element count in main content: ${finalElementCount}`);
			debugLog('Tidy', `Elements removed: ${startElementCount - finalElementCount}`);

			return {
				content: mainContent.outerHTML
			};
		} catch (error) {
			debugLog('Tidy', 'Error processing document:', error);
			return null;
		} finally {
			// Help garbage collection
			clone.body.innerHTML = '';
		}
	}

	private static simulateMobileViewport(doc: Document) {
		try {
			// Ensure head element exists
			if (!doc.head) {
				const head = doc.createElement('head');
				doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
			}

			// Add viewport meta
			let viewport = doc.querySelector('meta[name="viewport"]');
			if (!viewport) {
				viewport = doc.createElement('meta');
				viewport.setAttribute('name', 'viewport');
				viewport.setAttribute('content', this.MOBILE_VIEWPORT);
				doc.head.appendChild(viewport);
			} else {
				viewport.setAttribute('content', this.MOBILE_VIEWPORT);
			}

			// Create or update style element
			let style = doc.getElementById('obsidian-mobile-viewport');
			if (!style) {
				style = doc.createElement('style');
				style.id = 'obsidian-mobile-viewport';
				doc.head.appendChild(style);
			}
			
			style.textContent = `
				:root {
					--obsidian-viewport-width: ${this.MOBILE_WIDTH}px;
				}
				html {
					width: ${this.MOBILE_WIDTH}px !important;
				}
			`;
		} catch (error) {
			debugLog('Tidy', 'Error setting up mobile viewport:', error);
			// Continue execution even if viewport setup fails
		}
	}

	private static evaluateMediaQueries(doc: Document) {
		try {
			// Get all stylesheets, including inline styles
			const sheets = Array.from(doc.styleSheets).filter(sheet => {
				try {
					// Try to access cssRules to check if the sheet is accessible
					const rules = sheet.cssRules;
					return true;
				} catch (e) {
					// Skip inaccessible sheets (e.g., cross-origin)
					return false;
				}
			});
			
			sheets.forEach(sheet => {
				try {
					const rules = Array.from(sheet.cssRules);
					rules.forEach(rule => {
						if (rule instanceof CSSMediaRule) {
							// Check if this is a max-width media query
							if (rule.conditionText.includes('max-width')) {
								const maxWidth = parseInt(rule.conditionText.match(/\d+/)?.[0] || '0');
								
								// If our mobile width is less than the max-width, apply these rules
								if (this.MOBILE_WIDTH <= maxWidth) {
									Array.from(rule.cssRules).forEach(cssRule => {
										if (cssRule instanceof CSSStyleRule) {
											try {
												const elements = doc.querySelectorAll(cssRule.selectorText);
												elements.forEach(element => {
													// Apply the styles directly to the element
													element.setAttribute('style', 
														(element.getAttribute('style') || '') + 
														cssRule.style.cssText
													);
												});
											} catch (e) {
												// Skip problematic selectors
												debugLog('Tidy', 'Error applying styles for selector:', cssRule.selectorText, e);
											}
										}
									});
								}
							}
						}
					});
				} catch (e) {
					// Skip errors for individual stylesheets
					debugLog('Tidy', 'Error processing stylesheet:', e);
				}
			});
		} catch (e) {
			debugLog('Tidy', 'Error evaluating media queries:', e);
		}
	}

	private static removeHiddenElements(doc: Document) {
		let count = 0;

		// Existing hidden elements selector
		const hiddenElements = doc.querySelectorAll(this.HIDDEN_ELEMENTS_SELECTOR);
		hiddenElements.forEach(el => {
			el.remove();
			count++;
		});

		// Also remove elements hidden by computed style
		const allElements = doc.getElementsByTagName('*');
		Array.from(allElements).forEach(element => {
			const computedStyle = window.getComputedStyle(element);
			if (
				computedStyle.display === 'none' ||
				computedStyle.visibility === 'hidden' ||
				computedStyle.opacity === '0'
			) {
				element.remove();
				count++;
			}
		});

		debugLog('Tidy', `Removed ${count} hidden elements`);
	}

	private static removeClutter(doc: Document) {
		let basicSelectorCount = 0;
		let patternMatchCount = 0;

		// Basic selectors that don't need attribute variants
		const basicSelectors = [
			"#toc",
			".toc",
			'#comments',
				'.Ad',
				'.ad',
				'aside',
				'button',
				'fieldset',
				'footer',
				'form',
				'header',
				'input',
				'iframe',
				'label',
				'link',
				'nav',
				'noscript',
				'option',
				'select',
				'sidebar',
				'textarea',
				"[class^='ad-']",
				'[class$="-ad"]',
				"[id^='ad-']",
				'[id$="-ad"]',
				'[role="banner"]',
				'[role="complementary"]',
				'[role="navigation"]',
				'[role="toolbar"]'
		];

		// Patterns to match against class, id, and data-testid
		const patterns = [
			'avatar',
			'-ad-',
			'_ad_',
			'author',
			'banner',
			'breadcrumb',
			'byline',
			'comments',
			'complementary',
			'feedback',
			'fixed',
			'footer',
			'global',
			'header',
			'hide-',
			'metadata',
			'navbar',
			'navigation',
			'popular',
			'profile',
			'promo',
			'read-next',
			'reading-list',
			'recommend',
			'register',
			'related',
			'share',
			'sidebar',
			'social',
			'sticky',
			'subscribe',
			'toolbar',
			'top'
		];

		try {
			// First remove elements matching basic selectors
			basicSelectors.forEach(selector => {
				let elements: Element[] = [];
				
				if (selector.startsWith('.')) {
					// Class selector
					elements = Array.from(doc.getElementsByClassName(selector.slice(1)));
				} else if (selector.startsWith('#')) {
					// ID selector
					const element = doc.getElementById(selector.slice(1));
					if (element) elements = [element];
				} else {
					// Complex selector
					elements = Array.from(doc.querySelectorAll(selector));
				}

				elements.forEach(el => {
					if (el && el.parentNode) {
						el.remove();
						basicSelectorCount++;
					}
				});
			});

			debugLog('Tidy', `Removed ${basicSelectorCount} elements matching basic selectors`);

			// Then handle pattern matching using a more efficient approach
			const allElements = Array.from(doc.getElementsByTagName('*'));
			
			// We need to iterate backwards since we're removing elements
			for (let i = allElements.length - 1; i >= 0; i--) {
				const el = allElements[i];
				if (!el || !el.parentNode) continue;

				// Check if element should be removed based on its attributes
				const shouldRemove = patterns.some(pattern => {
					const classMatch = el.className && typeof el.className === 'string' && 
						el.className.toLowerCase().includes(pattern);
					const idMatch = el.id && el.id.toLowerCase().includes(pattern);
					const testIdMatch = el.getAttribute('data-testid')?.toLowerCase().includes(pattern);
					
					return classMatch || idMatch || testIdMatch;
				});

				if (shouldRemove) {
					el.remove();
					patternMatchCount++;
				}
			}

			debugLog('Tidy', `Removed ${patternMatchCount} elements matching patterns`);
			debugLog('Tidy', `Total elements removed: ${basicSelectorCount + patternMatchCount}`);
		} catch (e) {
			debugLog('Tidy', 'Error in removeClutter:', e);
		}
	}

	private static cleanContent(element: Element) {
		// Strip unwanted attributes
		this.stripUnwantedAttributes(element);
	}

	private static stripUnwantedAttributes(element: Element) {
		let attributeCount = 0;

		const processElement = (el: Element) => {
			// Get all attributes
			const attributes = Array.from(el.attributes);
			
			// Remove attributes not in whitelist and not data-*
			attributes.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (!this.ALLOWED_ATTRIBUTES.has(attrName) && !attrName.startsWith('data-')) {
					el.removeAttribute(attr.name);
					attributeCount++;
				}
			});
		};

		// Process the main element
		processElement(element);

		// Process all child elements
		element.querySelectorAll('*').forEach(processElement);

		debugLog('Tidy', `Stripped ${attributeCount} attributes from elements`);
	}

	private static findMainContent(doc: Document): Element | null {
		// First look for elements with explicit content markers
		const mainContent = doc.querySelector([
			'body',
			'main[role="main"]',
			'[role="article"]',
			'article',
			'[itemprop="articleBody"]',
			'.post-content',
			'.article-content',
			'#article-content',
			'.content-article',
		].join(','));

		if (mainContent) {
			debugLog('Tidy', 'Found main content via selector');
			return mainContent;
		}

		// Fall back to scoring elements
		const candidates = this.scoreElements(doc);
		if (candidates.length > 0) {
			debugLog('Tidy', `Found ${candidates.length} candidates, selecting highest scoring`);
			return candidates[0].element;
		}

		return null;
	}

	private static scoreElements(doc: Document): ContentScore[] {
		const candidates: ContentScore[] = [];

		this.BLOCK_ELEMENTS.forEach(tag => {
			Array.from(doc.getElementsByTagName(tag)).forEach((element: Element) => {
				const score = this.scoreElement(element);
				if (score > 0) {
					candidates.push({ score, element });
				}
			});
		});

		return candidates.sort((a, b) => b.score - a.score);
	}

	private static scoreElement(element: Element): number {
		let score = 0;

		// Score based on element properties
		const className = element.className.toLowerCase();
		const id = element.id.toLowerCase();

		// Check positive patterns
		if (this.POSITIVE_PATTERNS.test(className) || this.POSITIVE_PATTERNS.test(id)) {
			score += 25;
		}

		// Check negative patterns
		if (this.NEGATIVE_PATTERNS.test(className) || this.NEGATIVE_PATTERNS.test(id)) {
			score -= 25;
		}

		// Score based on content
		const text = element.textContent || '';
		const words = text.split(/\s+/).length;
		score += Math.min(Math.floor(words / 100), 3);

		// Score based on link density
		const links = element.getElementsByTagName('a');
		const linkText = Array.from(links).reduce((acc, link) => acc + (link.textContent?.length || 0), 0);
		const linkDensity = text.length ? linkText / text.length : 0;
		if (linkDensity > 0.5) {
			score -= 10;
		}

		// Score based on presence of meaningful elements
		const paragraphs = element.getElementsByTagName('p').length;
		score += paragraphs;

		const images = element.getElementsByTagName('img').length;
		score += Math.min(images * 3, 9);

		return score;
	}

	static toggle(doc: Document): boolean {
		if (this.isActive) {
			this.restore(doc);
			return false;
		} else {
			this.apply(doc);
			return true;
		}
	}

	static apply(doc: Document) {
		// Store original HTML for restoration
		this.originalHTML = doc.documentElement.outerHTML;
		
		// Parse the document
		const parsed = this.parse(doc);
		if (!parsed) {
			debugLog('Tidy', 'Failed to parse document');
			return;
		}

		// Create clean HTML structure
		doc.documentElement.innerHTML = `
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="${this.MOBILE_VIEWPORT}">
				<style>
					body {
						max-width: 800px;
						margin: 0 auto;
						padding: 20px;
						font-family: system-ui, -apple-system, sans-serif;
						line-height: 1.6;
					}
					img {
						max-width: 100%;
						height: auto;
					}
				</style>
			</head>
			<body>${parsed.content}</body>
		`;

		this.isActive = true;
	}

	static restore(doc: Document) {
		if (this.originalHTML) {
			// Remove our custom style
			doc.getElementById('obsidian-tidy-style')?.remove();
			
			// Restore the original HTML
			doc.documentElement.innerHTML = this.originalHTML;
			
			this.originalHTML = null;
			this.isActive = false;
		}
	}

} 