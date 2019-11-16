import React from 'react';
import ReactDOM from 'react-dom';
import some from 'lodash/some';
import isEqual from 'lodash/isEqual';
import Mixin, {UnprivilegedEditor, ReactQuillMixin, QuillOptions, Range, Value} from './mixin';

import Quill, {
	DeltaStatic,
	RangeStatic,
	StringMap as QuillStringMap,
	Sources as QuillSources,
} from 'quill';

interface ReactQuillProps {
	bounds?: string | HTMLElement,
	children?: React.ReactElement<any>,
	className?: string,
	defaultValue?: Value,
	formats?: string[],
	id?: string,
	modules?: QuillStringMap,
	onChange?(
		value: string,
		delta: DeltaStatic,
		source: QuillSources,
		editor: UnprivilegedEditor,
	): void,
	onChangeSelection?(
		selection: Range,
		source: QuillSources,
		editor: UnprivilegedEditor,
	): void,
	onFocus?(
		selection: Range,
		source: QuillSources,
		editor: UnprivilegedEditor,
	): void,
	onBlur?(
		previousSelection: Range,
		source: QuillSources,
		editor: UnprivilegedEditor,
	): void,
	onKeyDown?: React.EventHandler<any>,
	onKeyPress?: React.EventHandler<any>,
	onKeyUp?: React.EventHandler<any>,
	placeholder?: string,
	preserveWhitespace?: boolean,
	readOnly?: boolean,
	scrollingContainer?: string | HTMLElement,
	style?: React.CSSProperties,
	tabIndex?: number,
	theme?: string,
	value?: Value,

	/** @deprecated
	 * The `toolbar` prop has been deprecated. Use `modules.toolbar` instead.
	 * See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100.
	 * */
	toolbar?: never,

	/** @deprecated
	 * The `styles` prop has been deprecated. Use custom stylesheets instead.
	 * See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100
	 */
	styles?: never,

	/**
	 * @deprecated
	 * The `pollInterval` property does not have any effect anymore.
	 * You can safely remove it from your props.
	 * See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100.
	 */
	pollInterval?: never,
}

interface ReactQuillState {
	generation: number,
	value: Value,
	selection: Range,
}

interface ReactQuill extends ReactQuillMixin {};

class ReactQuill extends React.Component<ReactQuillProps, ReactQuillState> {

	static displayName = 'React Quill'

	/*
	Changing one of these props should cause a full re-render and a
	re-instantiation of the Quill editor.
	*/
	dirtyProps: (keyof ReactQuillProps)[] = [
		'modules',
		'formats',
		'bounds',
		'theme',
		'children',
	]

	/*
	Changing one of these props should cause a regular update. These are mostly
	props that act on the container, rather than the quillized editing area.
	*/
	cleanProps: (keyof ReactQuillProps)[] = [
		'id',
		'className',
		'style',
		'readOnly',
		'placeholder',
		'tabIndex',
		'onChange',
		'onChangeSelection',
		'onFocus',
		'onBlur',
		'onKeyPress',
		'onKeyDown',
		'onKeyUp',
	]

	static defaultProps = {
		theme: 'snow',
		modules: {},
		readOnly: false,
	}

	state: ReactQuillState = {
		generation: 0,
		selection: null,
		value: '',
	}

	/*
	The Quill Editor instance.
	*/
	editor?: Quill

	/*
	Reference to the element holding the Quill editing area.
	*/
	editingArea?: React.ReactInstance | null

	/*
	Used to compare whether deltas from `onChange` are being used as `value`.
	*/
	lastDeltaChangeSet?: DeltaStatic

	/*
	Stores the contents of the editor to be restored after regeneration.
	*/
	regenerationSnapshot?: {
		delta: DeltaStatic,
		selection: Range,
	}

	constructor(props: ReactQuillProps) {
		super(props);
		const value = this.isControlled()? props.value : props.defaultValue;
		this.state.value = value ?? '';
	}

	validateProps(props: ReactQuillProps): void {
		if ('toolbar' in props) throw new Error(
			'The `toolbar` prop has been deprecated. Use `modules.toolbar` instead. ' +
			'See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100'
		);

		if (props.modules?.toolbar?.[0]?.type) throw new Error(
			'Since v1.0.0, React Quill will not create a custom toolbar for you ' +
			'anymore. Create a toolbar explictly, or let Quill create one. ' +
			'See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100'
		);

		if (props.formats && (
			!(props.formats instanceof Array) ||
			some(props.formats, x => typeof x !== 'string')
		)) throw new Error(
			'You cannot specify custom `formats` anymore. Use Parchment instead.  ' +
			'See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100.'
		);

		if ('styles' in props) throw new Error(
			'The `styles` prop has been deprecated. Use custom stylesheets instead. ' +
			'See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100.'
		);

		if ('pollInterval' in props) throw new Error(
			'The `pollInterval` property does not have any effect anymore. ' +
			'Remove it from your props. ' +
			'See: https://github.com/zenoamaro/react-quill#upgrading-to-react-quill-v100.'
		);

		if (React.Children.count(props.children) > 1) throw new Error(
			'The Quill editing area can only be composed of a single React element.'
		);

		if (React.Children.count(props.children)) {
			const child = React.Children.only(props.children);
			if (child?.type === 'textarea') throw new Error(
				'Quill does not support editing on a <textarea>. Use a <div> instead.'
			);
		}

		if (
			this.lastDeltaChangeSet &&
			props.value === this.lastDeltaChangeSet
		) throw new Error(
			'You are passing the `delta` object from the `onChange` event back ' +
			'as `value`. You most probably want `editor.getContents()` instead. ' +
			'See: https://github.com/zenoamaro/react-quill#using-deltas'
		);
	}

	shouldComponentUpdate(nextProps: ReactQuillProps, nextState: ReactQuillState) {
		// TODO: Is there a better place to validate props?
		this.validateProps(nextProps);

		// If the component has been regenerated, we already know we should update.
		if (this.state.generation !== nextState.generation) {
			return true;
		}

		return some([...this.cleanProps, ...this.dirtyProps], (prop) => {
			return !isEqual(nextProps[prop], this.props[prop]);
		});
	}

	shouldComponentRegenerate(nextProps: ReactQuillProps): boolean {
		// Whenever a `dirtyProp` changes, the editor needs reinstantiation.
		return some(this.dirtyProps, (prop) => {
			return !isEqual(nextProps[prop], this.props[prop]);
		});
	}

	componentDidMount() {
		this.instantiateEditor();
		this.setEditorContents(this.editor!, this.state.value);
	}

	componentWillUnmount() {
		this.destroyEditor();
	}

	componentDidUpdate(prevProps: ReactQuillProps, prevState: ReactQuillState) {
		if (!this.editor) return;
		const editor = this.editor;

		// If we're changing one of the `dirtyProps`, the entire Quill Editor needs
		// to be re-instantiated. Regenerating the editor will cause the whole tree,
		// including the container, to be cleaned up and re-rendered from scratch.
		// Store the contents so they can be restored later.
		if (this.shouldComponentRegenerate(prevProps)) {
			const delta = editor.getContents();
			const selection = editor.getSelection();
			this.regenerationSnapshot = {delta, selection};
			this.setState({generation: this.state.generation + 1});
			this.destroyEditor();
		}

		// The component has been regenerated, so it must be re-instantiated, and
		// its content must be restored to the previous values from the snapshot.
		if (this.state.generation !== prevState.generation) {
			const {delta, selection} = this.regenerationSnapshot!;
			delete this.regenerationSnapshot;
			this.instantiateEditor();
			editor.setContents(delta);
			if (selection) editor.setSelection(selection);
			editor.focus();
		}

		// Update only if we've been passed a new `value`. This leaves components
		// using `defaultValue` alone.
		if ('value' in this.props) {
			const prevContents = prevState.value;
			const nextContents = this.props.value ?? '';

			// NOTE: Seeing that Quill is missing a way to prevent edits, we have to
			//       settle for a hybrid between controlled and uncontrolled mode. We
			//       can't prevent the change, but we'll still override content
			//       whenever `value` differs from current state.
			// NOTE: Comparing an HTML string and a Quill Delta will always trigger a
			//       change, regardless of whether they represent the same document.
			if (!this.isEqualValue(nextContents, prevContents)) {
				this.setEditorContents(editor, nextContents);
			}
		}

		// We can update readOnly state in-place.
		if ('readOnly' in this.props) {
			if (this.props.readOnly !== prevProps.readOnly) {
				this.setEditorReadOnly(editor, this.props.readOnly!);
			}
		}
	}

	instantiateEditor(): void {
		if (this.editor) {
			throw new Error('Editor is already instantiated');
		}
		this.editor = this.createEditor(
			this.getEditingArea(),
			this.getEditorConfig()
		);
	}

	destroyEditor(): void {
		if (!this.editor) {
			throw new Error('Destroying editor before instantiation');
		}
		this.unhookEditor(this.editor);
		delete this.editor;
	}

	/*
	We consider the component to be controlled if `value` is being sent in props.
	*/
	isControlled(): boolean {
		return 'value' in this.props;
	}

	getEditorConfig(): QuillOptions {
		return {
			bounds: this.props.bounds,
			formats: this.props.formats,
			modules: this.props.modules,
			placeholder: this.props.placeholder,
			readOnly: this.props.readOnly,
			scrollingContainer: this.props.scrollingContainer,
			tabIndex: this.props.tabIndex,
			theme: this.props.theme,
		};
	}

	getEditor(): Quill {
		if (!this.editor) throw new Error('Accessing non-instantiated editor');
		return this.editor;
	}

	getEditingArea(): Element {
		if (!this.editingArea) {
			throw new Error('Instantiating on missing editing area');
		}
		const element = ReactDOM.findDOMNode(this.editingArea);
		if (!element) {
			throw new Error('Cannot find element for editing area');
		}
		if (element.nodeType === 3) {
			throw new Error('Editing area cannot be a text node');
		}
		return element as Element;
	}

	getEditorContents(): Value {
		return this.state.value;
	}

	getEditorSelection(): Range {
		return this.state.selection;
	}

	/*
	True if the value is a Delta instance or a Delta look-alike.
	*/
	isDelta(value: any): boolean {
		return value && value.ops;
	}

	/*
	Special comparison function that knows how to compare Deltas.
	*/
	isEqualValue(value: any, nextValue: any): boolean {
		if (this.isDelta(value) && this.isDelta(nextValue)) {
			return isEqual(value.ops, nextValue.ops);
		} else {
			return isEqual(value, nextValue);
		}
	}

	/*
	Renders an editor area, unless it has been provided one to clone.
	*/
	renderEditingArea(): JSX.Element {
		const {children, preserveWhitespace, tabIndex} = this.props;
		const {generation} = this.state;

		const properties = {
			tabIndex,
			key: generation,
			ref: (instance: React.ReactInstance | null) => {
				this.editingArea = instance
			},
		};

		if (React.Children.count(children)) {
			return React.cloneElement(
				React.Children.only(children)!,
				properties
			);
		}

		return preserveWhitespace ?
			<pre {...properties}/> :
			<div {...properties}/>;
	}

	render() {
		return (
			<div
				id={this.props.id}
				style={this.props.style}
				key={this.state.generation}
				className={`quill ${this.props.className ?? ''}`}
				onKeyPress={this.props.onKeyPress}
				onKeyDown={this.props.onKeyDown}
				onKeyUp={this.props.onKeyUp}
			>
				{this.renderEditingArea()}
			</div>
		);
	}

	onEditorChangeText(
		value: string,
		delta: DeltaStatic,
		source: QuillSources,
		editor: UnprivilegedEditor,
	): void {
		const currentContents = this.getEditorContents();

		// We keep storing the same type of value as what the user gives us,
		// so that value comparisons will be more stable and predictable.
		const nextContents = this.isDelta(currentContents)
			? editor.getContents()
			: editor.getHTML();

		if (!this.isEqualValue(nextContents, currentContents)) {
			// Taint this `delta` object, so we can recognize whether the user
			// is trying to send it back as `value`, preventing a likely loop.
			this.lastDeltaChangeSet = delta;
			this.setState({ value: nextContents });
			this.props.onChange?.(value, delta, source, editor);
		}
	}

	onEditorChangeSelection(
		nextSelection: RangeStatic,
		source: QuillSources,
		editor: UnprivilegedEditor,
	): void {
		const currentSelection = this.getEditorSelection();
		const hasGainedFocus = !currentSelection && nextSelection;
		const hasLostFocus = currentSelection && !nextSelection;

		if (isEqual(nextSelection, currentSelection)) return;

		this.setState({ selection: nextSelection });
		this.props.onChangeSelection?.(nextSelection, source, editor);

		if (hasGainedFocus) {
			this.props.onFocus?.(nextSelection, source, editor);
		} else if (hasLostFocus) {
			this.props.onBlur?.(currentSelection, source, editor);
		}
	}

	focus(): void {
		if (!this.editor) return;
		this.editor.focus();
	}

	blur(): void {
		if (!this.editor) return;
		this.setEditorSelection(this.editor, null);
	}
}

// TODO: Understand what to do with Mixin.
Object.assign(ReactQuill.prototype, Mixin);

export default ReactQuill;
