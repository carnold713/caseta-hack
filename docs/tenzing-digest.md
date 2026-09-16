# Tenzing, page by page

A digest of Lutron's "Tenzing" design system as documented in the Figma file `Tenzing` (fileKey `j9kGU3eTju9WGZQjvFR4NQ`), written so that nobody has to open Figma to re-skin Pico Hack. Every number and hex below was read from the file with the read-only MCP tools (`get_metadata`, `get_screenshot`, `get_design_context`, `get_variable_defs`); nothing was written to the file. Node ids are given so a value can be checked later. Where the file does not say something, this document says "not in the file" rather than guessing.

The file is a component library, not an app: each top-level page holds one component, its variants as symbols, and a row of 1728x1117 documentation frames (Overview, Sizes, Variants, States, Anatomy, Measurements, Interaction, Motion, Usage Guidelines and Best Practices, Accessibility, Example, Changelog). The cover calls it "Tenzing Design System", subtitled with a chip that reads "Lutron Connect Web", dated February 2023; the component pages carry their own version chips (Calendar v23.10.02, Chip / Select / VisualPicker / ActionIcon / Menus v24.05.21, Toggle Control v25.2.12). It is the design language of Lutron's web product ("Connect Places" appears in one example screen), which is why it is desktop first and light.

---

## 0. The system in one page

**Light or dark: light.** Every documented component sits on white or near-white. There is a `Dark Mode` property on one atom only (the Calendar footer, `15618:7737`), and the cover, which is a dark canvas, resolves the `Typography/primary` variable to `#e9e9e9` instead of `#262626`, which shows a dark mode exists in the variable collection; but no dark surface, border or button token is exposed anywhere in this file, and no component is documented on dark. Treat Tenzing as a light system with an undocumented dark mode.

**Colour.** One accent, Lutron's product blue `#006dcc` (`Button/primary`, `Icons/theme`, `Borders & Dividers/focus`, `Status & Notifications/information` all resolve to it). Dark grey ink `#262626`, secondary ink `#666666`. Surfaces are white `#ffffff` (`Surface/Surface 3`), off-white `#fcfcfc` (`Surface/Surface 2`) and a page background `#f8f8f8` (`Surfaces/background`). Almost every fill and line is black at a small alpha: 2% (zebra), 4% (disabled), 6% (secondary button), 9% (divider), 10% (hover), 13% (border), 31% (checkbox line), 60% (hover outline), 90% (input outline). Danger is `#cc0000`, success `#3a7934`. The only dark colours in the file are a chip pair on the cover, `#365876` background with `#cce7ff` text (`Chips/input background` and `Chips/input content`), and a brand variable `Lutron Blue #1E75BB` that no component uses.

**Type.** Helvetica Neue only, Regular 400 / Medium 500 / Bold 700, letter spacing 0 everywhere. A small scale: 12/16, 14/16, 16/20, 18/24, 20/24, 24/28, 40/48. Sentence case; no uppercase, no tight tracking.

**Radius.** A 4 / 8 / 12 / 16 / 20 / 24 / 28 scale. Inputs and small tags are 4, cards and tiles 8, menus, dialogs and sliders 12, small buttons 16, chips 16 / 24, icon circles 24 or 28, the primary CTA 28. Nothing is fully squared, nothing is a huge 999px pill except by being a 24 or 28 radius on a 48 or 56 tall control.

**Borders and shadows, not grey-on-grey.** Cards are white with a 1px `rgba(0,0,0,0.09)` border on the `#f8f8f8` page. Floating things (menus, popovers, dialogs, the lighting cards) are white with a layered drop shadow and a 0.4px inner outline at 20% black. Inputs are outlined, not underlined.

**Icons.** Thin-stroke outline glyphs (a gear, a bulb, an external-link box, chevrons, a profile circle, a magnifier), drawn in a 16 / 20 / 24 / 32 box through an `IconWrapper` component whose description reads: "This component allows you to change the size of the nested icon. Hit Enter to change the icon itself." Icon colour follows text: `#262626` primary, `#666666` secondary, `#006dcc` theme, white on a filled primary.

**Focus** is always a 2px `#006dcc` ring. **Hover** is a darker fill (blue `#004480`, red `#990000`, or +4% black on greys). **Pressed** is darker again (`#003666`, `#880000`, or an inset shadow `0 2px 5px rgba(0,0,0,0.3)`). **Disabled** is 4% black fill with `rgba(179,179,179,0.4)` content.

---

## 1. Tokens found in the file

Variables are read per node, so this is the union of what the component frames expose (`get_variable_defs` on `36459:27650`, `37202:273895`, `37185:15809`, `37635:3613`, `36954:13222`, `39071:80482`, `33040:2752`, `38359:3357`, `40039:8588`, `27227:36112`).

### Surfaces and text

| variable | value | where it appears |
|---|---|---|
| `Surfaces/background` | `#f8f8f8` | page background, the side nav |
| `Surface/Surface 2` | `#fcfcfc` | a Visual Picker card at rest |
| `Surface/Surface 3` (also `Surfaces/surface3`) | `#ffffff` | cards, menus, popovers, dialogs, hovered Visual Picker |
| `Typography/primary` | `#262626` (`#e9e9e9` on the dark cover) | titles, row text, chip text |
| `Typography/secondary` | `#666666` | labels, subtext, ghost text, tile labels, section headers |
| `Typography/disabled` | `#b3b3b366` (`rgba(179,179,179,0.4)`) | disabled text |
| `Typography/secondarydisabled` | `rgba(115,115,115,0.4)` | disabled shortcut text in a list item |
| `Typography/on-button_primary`, `Typography/button_primary` | `#ffffff` | text on blue |
| `Typography/theme` | `#006dcc` | the hovered "See All" row |
| `Typography/button-primarydisabled` | `rgba(255,255,255,0.4)` | the grip on a slider fill |

### Accent, status, buttons

| variable | value |
|---|---|
| `Button/primary`, `Buttons/primary`, `Theme/theme`, `Icons/theme`, `Borders & Dividers/focus`, `Status & Notifications/information` | `#006dcc` |
| `Button/primary_hover`, `Theme/hover` | `#004480` |
| `Button/primary_pressed` | `#003666` |
| `Button/secondary`, `Buttons/secondary` | `#0000000f` (6% black) |
| `Button/secondary_hover`, `Button/secondary_pressed` | `#0000001a` (10% black) |
| `Button/disabled` | `#0000000a` (4% black) |
| `Button/danger`, `Status & Notifications/error`, `Icons/error`, `Error/error` | `#cc0000` |
| `Button/danger_hover` | `#990000` |
| `Button/danger_pressed` | `#880000` |
| `Icons/success` | `#3a7934` |
| `Icons/disabled_theme` | `#006dcc66` (blue at 40%) |
| `Icons/primary` `#262626` · `Icons/secondary` `#666666` · `Icons/on-primary`, `Icons/white` `#ffffff` · `Icons/disabled` `#b3b3b366` | |
| `Lutron Blue` | `#1E75BB` (brand variable on the cover; used by no component) |

### Lines

| variable | value | use |
|---|---|---|
| `Borders & Dividers/4_opacity` | `#000000e5` (90%) | text input and select outline |
| `Borders & Dividers/3_opacity` | `#00000099` (60%) | hovered input outline (2px) |
| `Borders & Dividers/2_opacity`, `Border & Divider Lines/border2_opacity` | `#00000021` (13%) | slider outline, status text button, menu scrollbar |
| `Borders & Dividers/1_opacity` | `#0000004f` (31%) | checkbox line |
| `Borders & Dividers/divider_opacity`, `Border & Divider Lines/divider_opacity` | `#00000017` (9%) | card borders, outlined toggle icons, device tiles, dividers |
| `Borders & Dividers/disabled` | `#ebebeb` | disabled input outline |
| `Borders & Divider Lines/Light/Solid/Divider Line` | `#E6E6E6` | a solid divider (Motion frame) |
| `Surface/Borders&Dividers/Outline Variant, 40% Transp` | `#cccccc66` | documentation only |
| `Table/zebra`, `Tables/zebra-default` | `#00000005` (2%) | selected chip fill, off device tile fill |
| `Table/hover` | `#0000000f` (6%) | |

### Chips and tags

| variable | value |
|---|---|
| `Chips/filter_border`, `Chips/filter default border`, `Chips/disabled_content` | `#b3b3b3` |
| `Chips/filter_content`, `Chips/filter default content` | `#262626` |
| `Chips/filter_bg` | `rgba(0,0,0,0.06)` |
| `Chips/filter_selected_border` | `#006dcc` |
| `Chips/disabled_bg` | `rgba(0,0,0,0.04)` |
| `Chips/hw-background` | `rgba(0,109,204,0.1)` (a device tile that is on) |
| `Chips/hw-background-hover` | `rgba(0,109,204,0.2)` |
| `Chips/red-background` | `rgba(204,0,0,0.1)` · `Chips/red-content` `#990000` |
| `Chips/green-background` | `#cee9cc` · `Chips/green-content` `#31672d` |
| `Chips/input background` | `#365876` · `Chips/input content` `#cce7ff` (the dark chip on the cover) |

### Type

`Typography/Family/Family` = Helvetica Neue. Weights `Regular`, `Medium`, `Bold`. Sizes (`Typography/Font Height/*`): s 12, m 14, lg 16, xl 18, 2xl 20, 3xl 24, 5xl 40. Line heights (`Typography/Line Height/*`): s 16, md 20, lg 24, xl 28, 3xl 48. Named text styles used by components:

| style | size / line | weight | seen on |
|---|---|---|---|
| `Regular/r12` | 12/16 | 400 | labels, subtext, tile subtitles, helper text |
| `Regular/r14`, `Body/Body Small` | 14/16 | 400 | select ghost text (S), checkbox labels, day names |
| `Regular/r16` | 16/20 | 400 | input text (M), device status, nav rows, status text button |
| `Regular/r18`, `Body/Body Large` | 18/24 | 400 | menu list items, documentation notes |
| `Regular/r24` | 24/28 | 400 | documentation paragraphs |
| `Regular/r40` | 40/48 | 400 | the "Aa" specimen on the cover |
| `Medium/m14` | 14/16 | 500 | chip S, small buttons, tags, tile titles, "Back" |
| `Medium/m16` | 16/20 | 500 | chip M, menu header, progress title, device names, nav |
| `Medium/m18` | 18/24 | 500 | chip L, version chips, widget headers |
| `Medium/m20` | 20/24 | 500 | dialog headers ("Switched (On/Off)") |
| `Bold/h18` | 18/24 | 700 | side nav place name |
| `Bold/h20` | 20/24 | 700 | motion annotation title |
| `Bold/h24` | 24/28 | 700 | page title ("Open Office") |
| (documentation titles) | 48 | 700 | "Overview", "States", frame titles only |
| `Monotype/c14`, `c16` | 14/16, 16/20 | Courier New | documentation notes only |

### Radii, padding, spacing

Radii: `Radius_0` 0 · `Radius_xs` / `Radius_03` 4 · `Radius_s` / `Radius_04` 8 · `Radius_md` / `Radius_05` 12 · `Radius_lg` / `Radius_06` 16 · `Radius_07` 20 · `Radius_xl` / `Radius_08` 24 · `Radius_09` 28. Two one-offs: 32 (the device tile icon circle) and 96 (the "Aa" circle on the cover).

Padding: `Padding_0` 0 · `Padding_xs` 4 · `Padding_sm` 8 · `Padding_md` 12 · `Padding_lg` 16 · `Padding_xl` 24 · `Padding_2xl` 32, and a numbered series `Padding_01` 0, `_03` 4, `_04` 8, `_05` 12, `_06` 16, `_07` 20, `_08` 24, `_09` 28, `_11` 40, `_12` 48. Spacing: `Spacing_00` 0, `_01` 4, `_02` 2, `Spacingl_03` 12, `_04` 16 (8 in one older collection), `_05` 20, `_06` 24, `_08` 32, `_11` 44, `_13` 56, `_14` 64; `Paddings & Gaps/p-4` 16.

### Shadows and motion

| style | layers |
|---|---|
| `Drop Shadows/Light/1` | `0 1.6px 3.6px #00000021`, `0 0.3px 0.9px #0000001A`, inner `0 0 0 0.4px #00000033` |
| `Drop Shadows/Light/2` | `0 3.2px 7.2px #00000021`, `0 0.6px 1.8px #0000001A`, same inner |
| `Drop Shadows/Light/3` | `0 6.4px 14.4px #00000021`, `0 1.2px 3.6px #0000001C`, same inner |
| `Drop Shadows/Light/5` | `0 14.8px 28.2px #0000002E`, `0 2.4px 7.2px #00000024`, same inner |
| `Inner Shadow/Light/Secondary Button Pressed` | inset `0 2px 5px #0000004D` |

Every floating surface carries the 0.4px inner outline as well as the drop shadow; on a white surface it reads as a hairline edge.

Motion, from the annotated frames: **Fast Responsive** `cubic-bezier(0.4, 0.12, 0.3, 1)`, 150 ms (tokens `curve_responsive`, `duration_responsive_fast`: hover, shadow and padding change); **Slow Responsive**, same curve, 255 ms (`duration_responsive_slow`: press to select or deselect); **Slow Transition** `cubic-bezier(0.3, 0, 0, 1)`, 600 ms (`curve_transition`, `duration_transition_slow`: the progress bar fill).

---

## 2. Cover (`0:1`, frame `27227:36112`)

A 1920x1080 dark canvas with a faint grid. Left: a dark chip "Lutron Connect Web" (`#365876` fill, `#cce7ff` 18/24 Medium text, 48 tall, 20px side padding, radius 24), then "Tenzing" in very large white Helvetica Neue Bold and "Design System" in the same size in blue, "February, 2023" bottom left. Right: a collage of live component instances: the Lutron logo in a blue rounded square, a "Aa" type specimen in a 96px blue circle (40/48 Regular white), four 60px colour swatches (blue, navy, grey, white), a ProgressBar card ("Title", "Downloading...", "25s"), the Calendar, a Tool Tip (white, 2px `#006dcc` border, blue text), a "CTA Button" (blue `#006dcc` pill, 28px side padding, 16px vertical padding, radius 28, white 16/20 Medium) and a selected Visual Picker with its blue check. The cover's own background colour is not a token in the file (it renders near black).

---

## 3. Chip (canvas `1914:10814`, "Chip - 10.30.2024", component set `36459:28560`)

**What it is** (Overview `36459:27650`): "A chip component in a design system is a small, versatile UI element that displays complex information concisely. It can present data (like a person's name), allow user input (like adding tags), trigger actions (like filtering content), or offer selections (like choosing options). A drop-down chip component combines the functionality of a chip (representing a selection or filter) with a dropdown menu for displaying additional options." Two kinds: the **Filter chip** (leading icon, text, trailing numeric badge) and the **Drop Down chip** (text, chevron, and a numeric badge that "only appears when 2 or more items are selected from the drop down").

**Anatomy** (`36459:27679`): Filter: 1 Text, 2 Leading Icon (optional), 3 Trailing Icon, "Numerical Only" (a 16px blue circle with a white number). Drop Down: 1 Text, 2 Drop Down Icon (chevron), 3 Numerical Icon.

**Sizes** (`36459:27658`, node values from `36516:24555`, `36516:24568`, `36516:24589`):

| size | height | side padding | vertical padding | text | icon box | radius | gap |
|---|---|---|---|---|---|---|---|
| Small | 32 | 16 | 12 | 14/16 Medium | 16 | 16 (`Radius_lg`, callout "r16") | 12 |
| Medium | 40 | 24 | 12 | 16/20 Medium | 20 | 24 (`Radius_xl`, callout "r20") | 12 |
| Large | 48 | 32 | 12 | 18/24 Medium | 24 | 24 (`Radius_08`, callout "r24") | 12 |

The Measurements frame (`36459:27686`) labels the radii r16 / r20 / r24 for S / M / L; the Medium component itself carries the `Radius_xl` variable (24), so at 40px tall it is a full pill either way.

**States** (`36516:24353`, four rows, filter and dropdown, unselected and selected):

| state | unselected | selected |
|---|---|---|
| Default | 1px `#b3b3b3` border, no fill, text `#262626` | 2px `#262626` border, fill `rgba(0,0,0,0.02)` |
| Hover | 1px `#b3b3b3`, fill `rgba(0,0,0,0.06)` | 2px `#262626`, fill `rgba(0,0,0,0.06)` |
| Focus | 2px `#006dcc` border | 2px `#006dcc` border |
| Disabled | 1px `#b3b3b3` border, text and icon `#b3b3b3` (dropdown variant adds fill `rgba(0,0,0,0.04)`) | fill `rgba(0,0,0,0.04)`, `#b3b3b3` border and text |

**Interaction** (`36541:25020`): a dropdown chip opens a white menu (radius 12, shadow) of checkbox rows in a tree ("Rented" with "Occupied", "Vacant" nested), with a "Clear All" small grey button and a blue "Save" button at the bottom; single select shows the chosen label in the chip, multi select shows the count badge.

**Usage guidelines** (`36459:27693`): 1 "Only use chips when they are necessary and provide value to the user. Too many chips can make the UI cluttered and confusing." 2 "Avoid using long or complex labels." 3 "Place chips in a way that makes sense to the user. For example, if you are using chips to filter content, place them next to the content they are filtering." 4 "For chips conveying a numerical values they should be a trailing notification icon." 5 "Chips should be consistent in formatting. Default should be no leading icon. If a leading Icon is needed then all chips in the grouping should have leading icons".

**Accessibility** (`36459:27700`): annotation "Aria Label: UI Label 'Text', Aria Role: Button"; 1 "Navigate to a chip with keyboard or switch input", 2 "Activate a chip with keyboard or switch input".

The documentation frames also use a **version chip** (`36459:27657`): 48 tall, 20px side padding, 8px vertical, 18/24 Medium, 1px `#b3b3b3` border, radius 24.

---

## 4. Select (`19340:23078`, "Select - 24.4.9", component set `19340:34228`, description "Dropdown Component")

**What it is** (Overview `37202:273867`): "A form control that accepts a single line of text, number or password" (the description is shared with the text input family; the component is the dropdown).

**Anatomy** (`37202:273941`): 1 Label ("When label is above the input text fill the Label Container with the surface color below the Text Field"), 2 Down Chevron, 3 Leading Icon, 4 Ghost Text, 5 Filled Text, 6 Subtext.

**Sizes** (`37202:273876`, Measurements `37202:277173`): the field is a 1px `#000000e5` outline, radius 4, on white; label above (12/16 Regular `#666666`, a red `#cc0000` asterisk, and a 16px help icon, gap 4, row 24 tall); subtext below (12/16 `#666666`).

| size | padding | text | icons | field height |
|---|---|---|---|---|
| Small | left 12, right 8, top and bottom 8 | 14/16 | 16 | 34 |
| Medium | left 12, right 10, top and bottom 10 | 16/20 | 20 | 42 |
| Large | 12 all round | 18/24 | 24 | 50 |

The Measurements notes: "Text Sizes: Small r14, Medium r16, Large r18" and "Icon Sizes: Small 16px, Medium 20px, Large 24px". Gap label to field 12 (Small in the states frame) or 4 (other instances); gap field to subtext 12 or 0.

**Variants**: Unfilled (ghost text `#666666`) and Filled (value `#262626`).

**States** (`37202:273895`): Enabled 1px `#000000e5`; Hover 2px `#00000099`; Focus 2px `#006dcc`; Error 2px `#cc0000`, subtext turns `#cc0000` with a 16px error icon; Disabled 1px `#ebebeb` outline, label, text, chevron and subtext at `rgba(179,179,179,0.4)`.

**Interaction** (`37202:277018`): Default, Open (a menu below), Open Selected, Selected.

**Usage guidelines** (`37202:274004`): 1 "Required sections in forms must be clearly labeled using a symbol or character like an asterisk (*)." 2 "Instructions must also be provided to define the meaning of the symbols or text. (e.g. required form fields are marked by asterisk ' * ')" 3 "Color can be used as long as it is not the only way to convey the required form field. If color is used, it must be combined with a symbol or text." 4 "When providing an indicator for a required field, it should be placed right before the form field. This allows a screen reader to read the indicator to a screen reader user right before the user activates the field."

**Accessibility** (`37202:274014`): "ARIA Label: UI Label, ARIA Role: Input".

---

## 5. VisualPicker (`26129:984`, "VisualPicker 24.10.31")

**What it is** (`37635:3598`): "A Visual Picker is an UI element that displays an image card that can be selected. It is usually found in a Visual Picker Group". Anatomy (`37635:3627`): 1 Card, 2 Image, 3 Title Label, 4 Subtitle Label, 5 Success Icon.

**Sizes** (`37635:3606`):

| size | card | card padding | radius | label |
|---|---|---|---|---|
| Extra Small | 48 | 8 | 4 | none |
| Petite | 64 wide card, 88 tall with label | 8 | 4 | 12/16 Regular, gap 8 |
| Small | 136 | 24 | 8 | 14/16 Medium title, 12/16 subtitle, gap 4, 16 under the card |
| Medium | 192 | 24 (image inset a further 8) | 8 | same |
| Large | 240 | 32 (image inset 8) | 8 | same |

Labels are `#666666`, centred. The card is `#fcfcfc` (`Surface 2`) with `Drop Shadows/Light/1` and the 0.4px inner outline.

**States** (`37635:3613`): Enabled as above; Hover: fill `#ffffff`, shadow `Light/3`; Focus: 2px `#006dcc` border; Selected: 2px `#006dcc` border, fill `#ffffff`, and a 32px blue check-circle icon overhanging the top-right corner by 8px (40px overhanging 12px on the Medium card); Disabled: image at 40% opacity, labels `rgba(179,179,179,0.4)`, no shadow.

**Motion** (`37635:7344`): Unselected to hover: Fast Responsive, 150 ms, "Image padding + shadow increase on mouse enter/hover". Press to select or deselect: Slow Responsive, 255 ms, "When Selecting/deselecting, Shadow change". Selected hover: Fast Responsive, "Shadow increase on mouse enter/hover".

**Usage guidelines** (`37635:3641`): 1 "If the Image is unable to load use the placeholder icon at 48px x 48px centered in the Card." 2 "For Image groups please use the 32px spacing both horizontal and vertical" 3 "Please see Visual Picker Group Spec page to see how they are used in a group." **Accessibility** (`37635:3648`): "ARIA Label: Title Label String, ARIA Role: Button"; "If there is no Visible Title Label or Subtitle Label. Ensure that the alt text is coded in as the Title Label".

---

## 6. ActionIcon (`16509:44811`, "ActionIcon - 23.8.28"), with Action Icon - Toggle and Toggle Control

**What it is** (`37185:15744`): "An action icon is a graphical representation of a command or function, used in user interfaces to make it easier for users to initiate an action without having to read or type text."

**Variants** (`37185:15865`): Primary (`#006dcc` fill, white icon); Secondary (two forms: a 1.75px `#006dcc` outline with a blue icon, or "Secondary - Filled", `rgba(0,0,0,0.06)` circle with a dark icon); Danger (`#cc0000` fill, white icon); Transparent (icon only, `#262626`); Subtle (icon only; the container appears on hover, either a circle or an 8px-radius "Subtle Fill Square"); Subtle Danger (`#cc0000` icon only).

**Sizes** (`37185:15840`):

| size | box | icon | padding | radius |
|---|---|---|---|---|
| Extra small | 24 | 16 | 4 | 12 |
| Small | 32 | 20 | 6 | 16 |
| Medium | 40 | 20 | 10 | 24 |
| Large | 48 | 24 | 12 | 24 |
| Extra large | 56 | 32 | 12 | 28 |

**States** (`37185:15809`): Hover: primary `#004480`, danger `#990000`, secondary and subtle fill `rgba(0,0,0,0.1)`, outlined gets `rgba(0,0,0,0.02)`. Pressed: primary `#003666`, danger `#880000` with inset `0 2px 5px rgba(0,0,0,0.3)`, greys `rgba(0,0,0,0.1)`, outlined `rgba(0,0,0,0.06)`. Focused: a 2px `#006dcc` ring; filled variants add a 2px white inner stroke between fill and ring; the outlined variant gets a 1.75px blue outer ring with a 2px gap. Disabled: fill `rgba(0,0,0,0.04)` with the icon at `rgba(179,179,179,0.4)`; outlined disabled border `rgba(0,109,204,0.4)`.

**Usage guidelines** (`37185:15911`): 1 "Use a consistent set of icons across the design system to maintain visual familiarity and brand identity. Ensure that icons with similar meanings have similar styles and proportions." 2 "Choose the appropriate icon size based on its context and surrounding elements. Ensure that icons are large enough to be easily seen and identified, especially on touch devices." 3 "Position icons strategically to guide user interactions and enhance the overall user experience. Avoid cluttering the screen with too many icons, and consider using tooltips or other interactions to provide contextual information." 4 "While icons can be effective for communicating actions, avoid using them in place of clear and concise text labels. Text labels provide additional context and accessibility for users who may not be familiar with icons." 5 "For Subtle Action Icons Designer should match the hover style to the elements it is connected to rounded rectangle or circle." 6 "Transparent Action Icons should be used when paired with other secondary color elements. If there is a primary element it must be paired with use one of the subtle Variants".

**Accessibility** (`37185:15918`): "Label: Close", "Role: Button"; 1 "Target of all Icon Buttons shall be a minimum of 48px by 48px" 2 "Users should be able to understand the meaning of the icon easily" 3 "User must be able to navigate to and activate an icon button with assistive technology".

### Action Icon - Toggle (`39512:23723`, set `39512:24043`)

"Action Icon - Toggle allows the user turn an item 'on/off' without the the use of a toggle switch. This allows for a more graphical toggle action." Component description: "Standard Icon buttons are low-emphasis buttons. They are used for the lowest priority actions, especially when presenting multiple options. Icon buttons can be placed on a variety of backgrounds. Until the button is interacted with, its container isn't visible." Small size: 40px box, 20px icon, 8px padding, radius 20. Four variants x selected:

| variant | unselected | selected |
|---|---|---|
| Standard | icon only, `#262626` | icon only, `#006dcc` |
| Filled | `rgba(0,0,0,0.06)` circle, dark icon | `#006dcc` circle, white icon |
| Outlined Filled | white circle, 1px `rgba(0,0,0,0.09)` border | `#006dcc` circle, white icon |
| Outlined Only | 1px `rgba(0,0,0,0.09)` border, dark icon | 2px `#006dcc` border, blue icon |

### Action Icon - Toggle Control (`40039:8588`, v25.2.12)

"Action Icon - Toggle switch allows the user turn an item 'on/off'. This allows for a more graphical toggle action." Two stacked 136x72 rectangles, radius 4, 4px apart: off `rgba(0,0,0,0.06)` with a dark 24px bulb, on `#006dcc` with a white bulb. Above them a status text button "Off" (136x48, radius 12, 1px `rgba(0,0,0,0.13)` border, 16/20 Regular `#262626`). Shown inside a white dialog card: radius 12, `Drop Shadows/Light/5`, header 20/24 Medium `#262626` with a 24px close icon, 24px padding, content padded 56 vertically.

### The lighting line-up (`39675:13644`, "Lighting Controls Line-Up") and Device Control page (`39675:23918`)

Not documentation frames but working designs on the ActionIcon page, and the closest thing in the file to a lighting app.

Five white dialog cards (radius 12, `Light/5` shadow): "Switched (On/Off)", "Dimmed (0-100)", "Color Temperature", "Full Color", "Vibrancy". The **dimmer** (`39675:13645`): a 48px blue Large ActionIcon (the bulb) on top; a status text button reading "25%" (136x48); the **slider** (`39675:13773`): a 136x320 well, white, 1px `rgba(0,0,0,0.13)` border, radius 12, filled from the bottom with `#006dcc` (the fill's bottom corners are radius 12, the top edge is straight), a 40x4 grip in `rgba(255,255,255,0.4)` 8px below the fill's top edge; under it two 40px secondary-filled circles with chevron-down and chevron-up. Notes: "Levels: 0 - 100%", "0% = Off, 100% = On". Colour temperature: the same well with a white-to-amber gradient, "1400K - 7000K"; "Color Temperature w/ Warm-Dimming" adds a note that warm dim "mimics the warmth of incandescent bulbs"; Full Color is a hue square "e.g. x,y coordinates"; Vibrancy a well with High / Medium / Low. **Tabs** (`39675:13819`): three Outlined Only toggle icons, 40px, 8px apart, the selected one with the 2px blue ring ("Choose between Color Temperature, Full Color, or Vibrancy", "Tooltips on hover after a brief delay"). **Badges** (`39675:13869`): 24px `#cc0000` circle, 4px padding, 16px white icon ("Show status of: Low battery, NLO, Timer"). **Buttons**: 135x64 rectangles radius 8, grey off and blue on ("Displays Status by turning blue").

The **Device Control** page ("Connect Places", `39675:23921`): page `#f8f8f8`; a 308px side nav on `#f8f8f8` with 44px rows (16/20, `#666666` for children, Medium `#262626` for parents, 20px leading icons), the selected row a full-width `#006dcc` bar with white text and `Light/2` shadow; a Back link (16px chevron plus "Back" 14/16 Medium) above the page title 24/28 Bold; a small button (min-width 104, 32 tall, radius 16, `rgba(0,0,0,0.06)` fill, 14/16 Medium, optional 16px leading icon, e.g. "Refresh"); stat cards (white, 1px `rgba(0,0,0,0.09)` border, radius 8, padding 24 / 16, title 16/20 Medium `#666666`, a text button at the right, a big number 28 tall); a tag "3 Alerts" (`rgba(204,0,0,0.1)` fill, radius 4, 12x8 padding, 14/16 Medium `#990000`, 16px icon); the **Control Widgets** card (white, 1px `rgba(0,0,0,0.09)` border, radius 12, padding 24, header "Device Control" 18/24 Medium `#666666` with 32px square action icons radius 4); and the **Device Card** (`39675:23389` off, `39675:23419` on): 180 wide (min 171), padding 16, radius 8, gap 24; off = `rgba(0,0,0,0.02)` fill with `rgba(0,0,0,0.09)` border, on = `rgba(0,109,204,0.1)` fill with `rgba(0,109,204,0.2)` border; a 56px icon slot holding a 48px ring (grey off, blue on) and a 32px bulb; name 16/20 Medium `#262626`; status 16/20 Regular `#666666` ("Off", "50%"); an optional 12px colour dot after a 1px 16px-tall divider; a red badge at the top right. A **Switch** (`39675:23949`) is 44x24; in the render its on state is a `#006dcc` track with a white knob (the switch's own fills are baked into an SVG, so its off colours are not in the file).

---

## 7. Menus (`6531:38953`, "Menus - 23.9.15"): Menu and List Item

**Menu** (`36954:13222`): "Menu represents a list of options that can be displayed when a user interacts with a button, icon, or other element." Container: white (`Surface 3`), radius 12, `Drop Shadows/Light/3` plus the 0.4px inner outline, 4px side padding, 319 wide in the example. Top: a search row (16px side, 12px vertical padding) holding a search container: `rgba(0,0,0,0.06)` fill, radius 4, 40 tall, 16px side / 8px vertical padding, a 24px magnifier, placeholder 18/24 Regular `#666666`. A section header "Recents" 16/20 Medium `#262626` with 16px side / 20px vertical padding. Then the list, with a 16px scrollbar gutter whose bar is `rgba(0,0,0,0.13)` radius 16.

**Usage guidelines** (`36954:13265`): 1 "Only include the most important options in the menu. A long menu can be overwhelming and difficult to use." 2 "Use icons to represent menu items. Icons can help to make the menu more visually appealing and easier to understand." 3 "Group related menu items together. This will help users to find the options they need more easily." 4 "Show Keyboard shortcuts" 5 Interaction: "Users must make a selection from the Menu or click outside of the Menu to close the overlay." Dimensions: "1. Menu can have a max-height of 2/3rd of the device's viewport 2. For elements of a smaller or larger nature a Menu's max-width varies between device types: a. For phones, the max-width of the Menu can be 2/3rd of the phone's viewport b. For desktops, the max-width of the Menu can be 360px." **Accessibility** (`36954:13272`): "Ensure Tab order is logical. Starting from the top most item and working down."; "Aria Label: UI Text, Aria Role: Button".

**List Item** (`36954:24736`): "A single line item within a Menu". Measurements (`36954:24772`), 360 wide:

| type | padding | content |
|---|---|---|
| List | left 24, right 48, vertical 12 (the overlay marks 16 above and below the 24px icon) | 24px leading icon, text 18/24 Regular `#262626` (callout "r18"), gap 16, a 24px trailing icon 16px from the right, optional shortcut "ctrl + C" 18/24 `#666666` |
| Single Select | left and right 48, vertical 12 | a 24px checkmark at left 16 when selected |
| Multi Select | left and right 48, vertical 12 | a 24px checkbox at left 16: 2px `rgba(0,0,0,0.31)` border, radius 4 |
| See All | left 24, right 24, vertical 12 | 16/20 Medium `#262626` (callout "m16") |
| Search | 16 side, 12 vertical | the search container above |

**States** (`36954:24751`): List: enabled plain; hover `rgba(0,0,0,0.06)` fill; focus 2px `#006dcc` border; disabled text and icons `rgba(179,179,179,0.4)`. Search: hover `rgba(0,0,0,0.1)`; focus 2px `#006dcc` border on the `rgba(0,0,0,0.06)` container; disabled `rgba(0,0,0,0.04)`. See All: hover text `#006dcc`; focus 2px `#006dcc` border. Usage (`36954:24779`): 1 "Always show the 'External Link' Icon when List Item takes you to another page or site" 2 "Use Case Style for all list item titles."

---

## 8. Calendar (`15618:1304`, "Calendar - 24.01.10", set `15618:2129`)

Overview (`39071:80482`, description left as "What is this component?"). Four variants: Desktop and Mobile x Single Date Picker (392x520 desktop, 392x534 mobile) and Date Range (392x564 desktop, 392x578 mobile; the range picker in the docs is 572x564).

A white card, radius 12, `Drop Shadows/Light/3`, inner outline. Header: month "November 2023" 16/20 Medium centred between two 16px `#006dcc` chevrons in 40px targets. Day-of-week row 14/16 Regular `#666666` ("Su Mo Tu We Th Fr Sa"), 48 tall. Dates in 40x40 cells (`.Calendar-Date` states Unselected-Today, Unselected, Hover, Selected; `.Calendar-Range` Default / Start / End / mid, 48x40): 14/16, the selected date a `#006dcc` circle with white text. A time row: "from  Date" 16/20 `#666666`, a 120px Select ("10:00 AM"), "EST". Footer (`.Calendar-Footer`, 584x88, with Default / Error and Dark Mode True / False variants): a "Cancel" text button and a blue "Save" pill (16/20 Medium white, radius 24). A `.Calendar-Years` grid (336x264) and `.Calendar-year` atoms (64x48; Default, Hover, Selected, Disabled, Focus) back the year picker; `.Calendar-View Past - List` is a 180x372 list. Radii present across the component: 4, 12, 20, 24, 28.

Usage and accessibility frames (`39071:80551`, `39071:80558`) hold placeholder notes only ("Try and list the order of the guidelines in priority order.").

---

## 9. ProgressBar (`24407:1111`, "ProgressBar 24.03.28", set `25953:161394`)

"A progress bar is used in any instance where the software is performing a task and the user must wait for it to complete. The progress bar will show the user how much work has been done and how much work there is to go."

**Anatomy** (`33040:2773`): 1 Title ("This will be the title of the Progress Bar. All Progress Bars have a Title"), 2 Bar, 3 Helper Text ("This is not mandatory and can be toggled off ... phrases that help the user know what step the progress bar is on. The location something is being saved. etc."), 4 Estimate ("a non mandatory field that lets the user know how much progress is left in a non graphical format. this can be a percentage, a ratio, a time (minutes:seconds)"). Motion annotation: Slow Transition, curve 0.3, 0, 0, 1, 600 ms.

**Sizes** (`33424:4841`): track `rgba(0,0,0,0.06)`, fill `#006dcc`.

| size | bar | radius | title | helper / estimate | gaps |
|---|---|---|---|---|---|
| Small | 4 | 2 | 16/20 Medium `#262626` | 12/16 `#666666` | 12 |
| Medium | 8 | 4 | 16/20 Medium | helper 14/16, estimate 12/16 | 12 |
| Large | 16 | 8 | 18/24 Medium | 14/16 | title 12 below, subtext 8 above |

**States** (`33040:2752`): Loading; Success (a 20px `#3a7934` check circle at the header's right); Failure (a 20px `#cc0000` error circle). Atoms include Determinate (Start, Finished) and Indeterminate (Default, Middle, Finished Loading) bars.

**Usage** (`33040:2787`): 1 "All Progress Bars require either a Title or Helper Text. It may have both, but the progress bar is not allowed be left empty." 2 "For the String ensure to use short and concise messaging" 3 "Avoid vague language like Loading and Just a moment" 4 "If the loading action is of an indeterminate length of time please use the indeterminate loader until either the action is complete or the system reaches a determinate state for loading and switches to the determinate bar until loading action is complete" 5 "Provide a Time Out Toast or Error Pattern. Do not leave user on a loading state for too long." with the note "After 10 seconds the loader action should report back to the user of a time out error and give an action to retry the action ort contact support." **Accessibility** (`33040:2794`): "Label: Informative label + Title", "Role: Progress Bar".

**Example** (`33342:1360`): a notification card 360x128, white, with a 4px coloured bar down its left edge, a 20px leading icon, "Download" 16/20 Medium, a close icon, and the Medium progress bar under it.

---

## 10. Label & Subtext (`38359:3271`, "Label & Subtext - Figma ONLY")

"The Label component is to be used for all input fields and input groups." (`38359:3300`). Two atoms.

**Label** (`.Label`, sizes SM / MD / LG): text 12/16 Regular `#666666` (LG: 14/16), a required asterisk `#cc0000` at 12, gap 4, and a 16px help icon (an Extra Small ActionIcon, radius 12, 4px padding when focused with the 2px blue ring). Anatomy (`38359:3329`): 1 Label - String, 2 Required Field, 3 Help - Action Icon - Extra Small. In a field the label row is 24 tall.

**Subtext** (`.subtext`, sizes SM / MD 12/16, LG 14/16, all `#666666`), variants (`38701:532`): Standard (text only); Information (a 16px `#006dcc` info icon, gap 8); Warning (a 16px orange warning triangle: its hex is not exposed as a token in the file); Error (a 16px `#cc0000` icon and `#cc0000` text).

**Usage** (`38359:3343`, `38691:589`): 1 "On click the Help Icon reveals a Popover" (the Popover: white, radius 4, `Light/3` shadow, header 14/16 Medium with a 16px close, an 8px caret, 16px vertical / 8px side padding). 2 "Label String should always be short and reflect the input's purpose." **Accessibility** (`38359:3350`, `38691:599`): "Label: Help", "Role: Button"; "Users should be able to understand the meaning of the icon easily"; "User must be able to navigate to and activate an icon button with assistive technology".

**Example** (`38359:3357`) shows the whole input family with these labels, all on white, all outlined 1px `#000000e5`, radius 4:

| input | size shown | padding | text | extras |
|---|---|---|---|---|
| TextInput | SM | left 12, right 8, vertical 8 | 14/16 ghost `#666666` | 16px trailing copy icon; label gap 4 |
| Password Input Field | MD | left 12, right 10, vertical 10 | 16/20 | 20px "view" icon; label gap 8 |
| NumberInput | MD | left 12, right 8, vertical 8, min-width 120 | 16/20 | minus and plus as 16px icons in 24px boxes with a 16px divider ("Single-Side Controls") |
| TextArea | MD | 16 | 16/20 | 84 min height, 16px resize handle bottom right |
| Select | MD | left 12, right 10, vertical 10 | 16/20 | 20px leading icon and chevron |
| Image Picker | MD | left 12, right 10, vertical 10 | 16/20 | a 20px image thumbnail, chevron |
| CheckboxGroup | Small | each checkbox 16px, radius 4, 2px `rgba(0,0,0,0.31)` border, 4px padding, gap 8 to a 14/16 `#262626` label; items wrap with 16 x 24 gaps | | description: "Also called Check, Checkmark, Tick mark, Tick box, Selection box" |

A checked checkbox (seen in the Chip Interaction frame) is a blue `#006dcc` outline with a blue tick on white.

---

## 11. What is not in the file

- No dark surface, border or button tokens; no dark component renders (only the Calendar footer has a Dark Mode property, and the cover shows `Typography/primary` resolving to `#e9e9e9` on dark).
- No horizontal slider with a knob; the only sliders are the vertical filled wells on the lighting line-up.
- No toggle switch component page; the 44x24 switch appears as an instance whose fills are baked into an SVG.
- No tab bar, bottom navigation, sheet, dialog, toast or tooltip documentation pages (a dialog card, a tooltip and a notification card appear only as instances on the cover and in examples).
- The warning-icon orange and the cover background are not exposed as tokens.
- The Chip page's "Example" frame is a full "MacBook Pro" prototype (`38715:55665`) and was not read.
