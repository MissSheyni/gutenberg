/**
 * External dependencies
 */
import { noop } from 'lodash';

/**
 * WordPress dependencies
 */
import {
	getBlockTypes,
	unregisterBlockType,
	registerBlockType,
	createBlock,
} from '@wordpress/blocks';

/**
 * Internal dependencies
 */
import {
	resetPost,
	setupNewPost,
	mergeBlocks,
	replaceBlocks,
	editPost,
	savePost,
	requestMetaBoxUpdates,
	selectBlock,
} from '../../store/actions';
import effects from '../effects';
import * as selectors from '../../store/selectors';

// Make all generated UUIDs the same for testing
jest.mock( 'uuid/v4', () => {
	return jest.fn( () => 'this-is-a-mock-uuid' );
} );

describe( 'effects', () => {
	const defaultBlockSettings = { save: () => 'Saved', category: 'common', title: 'block title' };

	describe( '.MERGE_BLOCKS', () => {
		const handler = effects.MERGE_BLOCKS;
		const defaultGetBlock = selectors.getBlock;

		afterEach( () => {
			getBlockTypes().forEach( ( block ) => {
				unregisterBlockType( block.name );
			} );
			selectors.getBlock = defaultGetBlock;
		} );

		it( 'should only focus the blockA if the blockA has no merge function', () => {
			registerBlockType( 'core/test-block', defaultBlockSettings );
			const blockA = {
				uid: 'chicken',
				name: 'core/test-block',
			};
			const blockB = {
				uid: 'ribs',
				name: 'core/test-block',
			};
			selectors.getBlock = ( state, uid ) => {
				return blockA.uid === uid ? blockA : blockB;
			};

			const dispatch = jest.fn();
			const getState = () => ( {} );
			handler( mergeBlocks( blockA.uid, blockB.uid ), { dispatch, getState } );

			expect( dispatch ).toHaveBeenCalledTimes( 1 );
			expect( dispatch ).toHaveBeenCalledWith( selectBlock( 'chicken' ) );
		} );

		it( 'should merge the blocks if blocks of the same type', () => {
			registerBlockType( 'core/test-block', {
				merge( attributes, attributesToMerge ) {
					return {
						content: attributes.content + ' ' + attributesToMerge.content,
					};
				},
				save: noop,
				category: 'common',
				title: 'test block',
			} );
			const blockA = {
				uid: 'chicken',
				name: 'core/test-block',
				attributes: { content: 'chicken' },
			};
			const blockB = {
				uid: 'ribs',
				name: 'core/test-block',
				attributes: { content: 'ribs' },
			};
			selectors.getBlock = ( state, uid ) => {
				return blockA.uid === uid ? blockA : blockB;
			};
			const dispatch = jest.fn();
			const getState = () => ( {} );
			handler( mergeBlocks( blockA.uid, blockB.uid ), { dispatch, getState } );

			expect( dispatch ).toHaveBeenCalledTimes( 2 );
			expect( dispatch ).toHaveBeenCalledWith( selectBlock( 'chicken', -1 ) );
			expect( dispatch ).toHaveBeenCalledWith( replaceBlocks( [ 'chicken', 'ribs' ], [ {
				uid: 'chicken',
				name: 'core/test-block',
				attributes: { content: 'chicken ribs' },
			} ] ) );
		} );

		it( 'should not merge the blocks have different types without transformation', () => {
			registerBlockType( 'core/test-block', {
				merge( attributes, attributesToMerge ) {
					return {
						content: attributes.content + ' ' + attributesToMerge.content,
					};
				},
				save: noop,
				category: 'common',
				title: 'test block',
			} );
			registerBlockType( 'core/test-block-2', defaultBlockSettings );
			const blockA = {
				uid: 'chicken',
				name: 'core/test-block',
				attributes: { content: 'chicken' },
			};
			const blockB = {
				uid: 'ribs',
				name: 'core/test-block2',
				attributes: { content: 'ribs' },
			};
			selectors.getBlock = ( state, uid ) => {
				return blockA.uid === uid ? blockA : blockB;
			};
			const dispatch = jest.fn();
			const getState = () => ( {} );
			handler( mergeBlocks( blockA.uid, blockB.uid ), { dispatch, getState } );

			expect( dispatch ).not.toHaveBeenCalled();
		} );

		it( 'should transform and merge the blocks', () => {
			registerBlockType( 'core/test-block', {
				attributes: {
					content: {
						type: 'string',
					},
				},
				merge( attributes, attributesToMerge ) {
					return {
						content: attributes.content + ' ' + attributesToMerge.content,
					};
				},
				save: noop,
				category: 'common',
				title: 'test block',
			} );
			registerBlockType( 'core/test-block-2', {
				attributes: {
					content: {
						type: 'string',
					},
				},
				transforms: {
					to: [ {
						type: 'block',
						blocks: [ 'core/test-block' ],
						transform: ( { content2 } ) => {
							return createBlock( 'core/test-block', {
								content: content2,
							} );
						},
					} ],
				},
				save: noop,
				category: 'common',
				title: 'test block 2',
			} );
			const blockA = {
				uid: 'chicken',
				name: 'core/test-block',
				attributes: { content: 'chicken' },
			};
			const blockB = {
				uid: 'ribs',
				name: 'core/test-block-2',
				attributes: { content2: 'ribs' },
			};
			selectors.getBlock = ( state, uid ) => {
				return blockA.uid === uid ? blockA : blockB;
			};
			const dispatch = jest.fn();
			const getState = () => ( {} );
			handler( mergeBlocks( blockA.uid, blockB.uid ), { dispatch, getState } );

			expect( dispatch ).toHaveBeenCalledTimes( 2 );
			// expect( dispatch ).toHaveBeenCalledWith( focusBlock( 'chicken', { offset: -1 } ) );
			expect( dispatch ).toHaveBeenCalledWith( replaceBlocks( [ 'chicken', 'ribs' ], [ {
				uid: 'chicken',
				name: 'core/test-block',
				attributes: { content: 'chicken ribs' },
			} ] ) );
		} );
	} );

	describe( '.AUTOSAVE', () => {
		const handler = effects.AUTOSAVE;
		const dispatch = jest.fn();
		const store = { getState: () => {}, dispatch };

		beforeAll( () => {
			selectors.isEditedPostSaveable = jest.spyOn( selectors, 'isEditedPostSaveable' );
			selectors.isEditedPostDirty = jest.spyOn( selectors, 'isEditedPostDirty' );
			selectors.isCurrentPostPublished = jest.spyOn( selectors, 'isCurrentPostPublished' );
			selectors.isEditedPostNew = jest.spyOn( selectors, 'isEditedPostNew' );
		} );

		beforeEach( () => {
			dispatch.mockReset();
			selectors.isEditedPostSaveable.mockReset();
			selectors.isEditedPostDirty.mockReset();
			selectors.isCurrentPostPublished.mockReset();
			selectors.isEditedPostNew.mockReset();
		} );

		afterAll( () => {
			selectors.isEditedPostSaveable.mockRestore();
			selectors.isEditedPostDirty.mockRestore();
			selectors.isCurrentPostPublished.mockRestore();
			selectors.isEditedPostNew.mockRestore();
		} );

		it( 'should do nothing for unsaveable', () => {
			selectors.isEditedPostSaveable.mockReturnValue( false );
			selectors.isEditedPostDirty.mockReturnValue( true );
			selectors.isCurrentPostPublished.mockReturnValue( false );
			selectors.isEditedPostNew.mockReturnValue( true );

			expect( dispatch ).not.toHaveBeenCalled();
		} );

		it( 'should do nothing for clean', () => {
			selectors.isEditedPostSaveable.mockReturnValue( true );
			selectors.isEditedPostDirty.mockReturnValue( false );
			selectors.isCurrentPostPublished.mockReturnValue( false );
			selectors.isEditedPostNew.mockReturnValue( false );

			expect( dispatch ).not.toHaveBeenCalled();
		} );

		it( 'should return autosave action for clean, new, saveable post', () => {
			selectors.isEditedPostSaveable.mockReturnValue( true );
			selectors.isEditedPostDirty.mockReturnValue( false );
			selectors.isCurrentPostPublished.mockReturnValue( false );
			selectors.isEditedPostNew.mockReturnValue( true );

			handler( {}, store );

			expect( dispatch ).toHaveBeenCalledTimes( 2 );
			expect( dispatch ).toHaveBeenCalledWith( editPost( { status: 'draft' } ) );
			expect( dispatch ).toHaveBeenCalledWith( savePost() );
		} );

		it( 'should return autosave action for saveable, dirty, published post', () => {
			selectors.isEditedPostSaveable.mockReturnValue( true );
			selectors.isEditedPostDirty.mockReturnValue( true );
			selectors.isCurrentPostPublished.mockReturnValue( true );
			selectors.isEditedPostNew.mockReturnValue( true );

			// TODO: Publish autosave
			expect( dispatch ).not.toHaveBeenCalled();
		} );

		it( 'should set auto-draft to draft before save', () => {
			selectors.isEditedPostSaveable.mockReturnValue( true );
			selectors.isEditedPostDirty.mockReturnValue( true );
			selectors.isCurrentPostPublished.mockReturnValue( false );
			selectors.isEditedPostNew.mockReturnValue( true );

			handler( {}, store );

			expect( dispatch ).toHaveBeenCalledTimes( 2 );
			expect( dispatch ).toHaveBeenCalledWith( editPost( { status: 'draft' } ) );
			expect( dispatch ).toHaveBeenCalledWith( savePost() );
		} );

		it( 'should return update action for saveable, dirty draft', () => {
			selectors.isEditedPostSaveable.mockReturnValue( true );
			selectors.isEditedPostDirty.mockReturnValue( true );
			selectors.isCurrentPostPublished.mockReturnValue( false );
			selectors.isEditedPostNew.mockReturnValue( false );

			handler( {}, store );

			expect( dispatch ).toHaveBeenCalledTimes( 1 );
			expect( dispatch ).toHaveBeenCalledWith( savePost() );
		} );
	} );

	describe( '.REQUEST_POST_UPDATE_SUCCESS', () => {
		const handler = effects.REQUEST_POST_UPDATE_SUCCESS;
		let replaceStateSpy;

		const defaultPost = {
			id: 1,
			title: {
				raw: 'A History of Pork',
			},
			content: {
				raw: '',
			},
		};
		const getDraftPost = () => ( {
			...defaultPost,
			status: 'draft',
		} );
		const getPublishedPost = () => ( {
			...defaultPost,
			status: 'publish',
		} );

		beforeAll( () => {
			replaceStateSpy = jest.spyOn( window.history, 'replaceState' );
		} );

		beforeEach( () => {
			replaceStateSpy.mockReset();
		} );

		afterAll( () => {
			replaceStateSpy.mockRestore();
		} );

		it( 'should dispatch meta box updates on success for dirty meta boxes', () => {
			const dispatch = jest.fn();
			const store = { getState: () => ( {
				metaBoxes: { side: { isActive: true } },
			} ), dispatch };

			const post = getDraftPost();

			handler( { post: post, previousPost: post }, store );

			expect( dispatch ).toHaveBeenCalledTimes( 1 );
			expect( dispatch ).toHaveBeenCalledWith( requestMetaBoxUpdates( post ) );
		} );

		it( 'should dispatch notices when publishing or scheduling a post', () => {
			const dispatch = jest.fn();
			const store = { getState: () => ( {
				metaBoxes: { side: { isActive: true } },
			} ), dispatch };

			const previousPost = getDraftPost();
			const post = getPublishedPost();

			handler( { post, previousPost }, store );

			expect( dispatch ).toHaveBeenCalledTimes( 2 );
			expect( dispatch ).toHaveBeenCalledWith( expect.objectContaining( {
				notice: {
					content: <p><span>Post published!</span> <a>View post</a></p>, // eslint-disable-line jsx-a11y/anchor-is-valid
					id: 'SAVE_POST_NOTICE_ID',
					isDismissible: true,
					status: 'success',
					spokenMessage: 'Post published!',
				},
				type: 'CREATE_NOTICE',
			} ) );
		} );

		it( 'should dispatch notices when reverting a published post to a draft', () => {
			const dispatch = jest.fn();
			const store = { getState: () => ( {
				metaBoxes: { side: { isActive: true } },
			} ), dispatch };

			const previousPost = getPublishedPost();
			const post = getDraftPost();

			handler( { post, previousPost }, store );

			expect( dispatch ).toHaveBeenCalledTimes( 2 );
			expect( dispatch ).toHaveBeenCalledWith( expect.objectContaining( {
				notice: {
					content: <p>
						<span>Post reverted to draft.</span>
						{ ' ' }
						{ false }
					</p>,
					id: 'SAVE_POST_NOTICE_ID',
					isDismissible: true,
					status: 'success',
					spokenMessage: 'Post reverted to draft.',
				},
				type: 'CREATE_NOTICE',
			} ) );
		} );

		it( 'should dispatch notices when just updating a published post again', () => {
			const dispatch = jest.fn();
			const store = { getState: () => ( {
				metaBoxes: { side: { isActive: true } },
			} ), dispatch };

			const previousPost = getPublishedPost();
			const post = getPublishedPost();

			handler( { post, previousPost }, store );

			expect( dispatch ).toHaveBeenCalledTimes( 2 );
			expect( dispatch ).toHaveBeenCalledWith( expect.objectContaining( {
				notice: {
					content: <p><span>Post updated!</span>{ ' ' }<a>{ 'View post' }</a></p>, // eslint-disable-line jsx-a11y/anchor-is-valid
					id: 'SAVE_POST_NOTICE_ID',
					isDismissible: true,
					status: 'success',
					spokenMessage: 'Post updated!',
				},
				type: 'CREATE_NOTICE',
			} ) );
		} );
	} );

	describe( '.SETUP_EDITOR', () => {
		const handler = effects.SETUP_EDITOR;

		afterEach( () => {
			getBlockTypes().forEach( ( block ) => {
				unregisterBlockType( block.name );
			} );
		} );

		it( 'should return post reset action', () => {
			const post = {
				id: 1,
				title: {
					raw: 'A History of Pork',
				},
				content: {
					raw: '',
				},
				status: 'draft',
			};

			const result = handler( { post, settings: {} } );

			expect( result ).toEqual( [
				resetPost( post ),
			] );
		} );

		it( 'should return block reset with non-empty content', () => {
			registerBlockType( 'core/test-block', defaultBlockSettings );
			const post = {
				id: 1,
				title: {
					raw: 'A History of Pork',
				},
				content: {
					raw: '<!-- wp:core/test-block -->Saved<!-- /wp:core/test-block -->',
				},
				status: 'draft',
			};

			const result = handler( { post, settings: {} } );

			expect( result ).toHaveLength( 2 );
			expect( result ).toContainEqual( resetPost( post ) );
			expect( result.some( ( { blocks } ) => {
				return blocks && blocks[ 0 ].name === 'core/test-block';
			} ) ).toBe( true );
		} );

		it( 'should return post setup action only if auto-draft', () => {
			const post = {
				id: 1,
				title: {
					raw: 'A History of Pork',
				},
				content: {
					raw: '',
				},
				status: 'auto-draft',
			};

			const result = handler( { post, settings: {} } );

			expect( result ).toEqual( [
				resetPost( post ),
				setupNewPost( { title: 'A History of Pork' } ),
			] );
		} );
	} );

	// TODO: Reintroduce reusable blocks tests.
} );
