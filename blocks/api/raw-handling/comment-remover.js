/**
 * Browser dependencies
 */
const { COMMENT_NODE } = window.Node;

export default function( node ) {
	if ( node.nodeType !== COMMENT_NODE ) {
		return;
	}

	if ( node.nodeValue.indexOf( 'more' ) === 0 ) {
		// Grab any custom text in the comment
		const matches = node.nodeValue.match( /more(.*)/ );
		const customText = matches.length > 1 ? matches[ 1 ].trim() : '';

		// When a <!--more--> comment is found, we need to look for any
		// <!--noteaser--> sibling, but it may not be a direct sibling
		// (whitespace typically lies in between)
		let sibling = node;
		let noTeaser = false;
		while ( ( sibling = sibling.nextSibling ) ) {
			if (
				sibling.nodeType === COMMENT_NODE &&
				sibling.nodeValue === 'noteaser'
			) {
				noTeaser = true;
				sibling.parentNode.removeChild( sibling );
				break;
			}
		}

		// Conjure up a custom More element
		const more = createMore( customText, noTeaser );

		// Find the first ancestor to which the More element can be appended;
		// appending to the closer P parents fails
		let parent = node.parentNode;
		while ( parent.nodeName.toLowerCase() === 'p' && parent.parentNode ) {
			parent = parent.parentNode;
		}
		parent.appendChild( more );
	}

	node.parentNode.removeChild( node );
}

function createMore( customText, noTeaser ) {
	const node = document.createElement( 'wp-block' );
	node.dataset.block = 'core/more';
	if ( customText ) {
		node.dataset.customText = customText;
	}
	if ( noTeaser ) {
		// "Boolean" data attribute
		node.dataset.noTeaser = '';
	}
	return node;
}
