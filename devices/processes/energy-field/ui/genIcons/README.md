# The generation icons' outlines

`PvIcon` and `TurbineIcon` (`../fieldIcons.jsx`) draw the user's picture
`images/fix-panel-windtower.png` (iot AGENTS_TO_DO.md 2026-10-23): four
silhouettes in a row - the PV panel, the turbine's rotor, its tower, the
assembled turbine.

1. `trace.sh` (ImageMagick + potrace in a throwaway container): each
   silhouette cropped inside the picture's frame lines, grey, 4x up,
   slightly blurred, a 50 % threshold (the checkered background drops
   out), traced (specks under 60 px dropped) - `pv.svg`, `rotor.svg`,
   `tower.svg`; the assembled turbine only to check the parts against.
2. The rotor's hub - the circle at (567, 215.5) of the picture; the tower's
   axis passes under it (its foot is centred at x 952.25, the hub of the
   assembled turbine at the same distance from its left edge), so the parts
   join as in the 4th silhouette.
3. `genIconPaths.js` - the paths with one transform each into the icon's
   viewBox: the panel's outline (341 x 530.5); the turbine's - the rotor's
   swept circle (radius 212 about the hub at 212, 212) down to the tower's
   foot (424 x 538.5). Both icons are drawn at one height - the pylon's and
   the consumer's (`GEN_ICON_HEIGHT`).
