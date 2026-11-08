#!/usr/bin/env python3
# Erzeugt resources/img/silhouette-{m,f,u}.svg: eigene Scherenschnitte aus Stützpunkten (Porträtproportionen).
# Aufruf aus dem Modulordner: (cd resources/img && python3 ../../tools/scherenschnitte.py)
# Eigene Scherenschnitte: Stützpunkte nach Porträtproportionen, geglättet per Catmull-Rom -> kubische Bézier.
def kurve(pts, scharf=()):
    n=len(pts); d=f'M{pts[0][0]:.2f} {pts[0][1]:.2f}'
    for i in range(n):
        p0=pts[(i-1)%n]; p1=pts[i]; p2=pts[(i+1)%n]; p3=pts[(i+2)%n]
        t1=0 if i in scharf else 1/6; t2=0 if (i+1)%n in scharf else 1/6
        c1=(p1[0]+(p2[0]-p0[0])*t1, p1[1]+(p2[1]-p0[1])*t1)
        c2=(p2[0]-(p3[0]-p1[0])*t2, p2[1]-(p3[1]-p1[1])*t2)
        d+=f' C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}'
    return d+' Z'
MANN=[(37,89),(30,85.5),(23.5,77),(16.5,60),(18,40),(28,24),(46,16),(64,17.5),(74,25),(78,36),(79,46),(79.3,50),(77.8,53),(81,57.5),(86.5,63.5),(84.5,66.2),(79.6,66.6),(81.2,69.2),(79.6,71.2),(80.6,73.8),(78.2,76.6),(80.6,81.2),(77.6,86),(70,88),(66.4,92),(67.6,97),(68.4,104),(71,114),(40,106),(39,97)]
FRAU=[(38,88),(31.5,85),(26,78),(19.5,62),(20,44),(28,27),(45,18.5),(62,19),(72.5,26),(77,37),(77.5,46),(77.6,50),(76.5,53),(79.6,57.6),(83.6,63),(82,65.4),(78.2,65.8),(80,68.4),(78.2,70.6),(79.6,73.2),(77.2,76),(78.4,80.4),(75.2,84.8),(68.6,86.6),(65.8,91),(66.2,98),(67.4,106),(70,115),(41,107),(40,97)]
SCHARF_M={MANN.index((71,114)),MANN.index((40,106))}; SCHARF_F={FRAU.index((70,115)),FRAU.index((41,107))}
DUTT='<ellipse cx="22.5" cy="70" rx="13.5" ry="12.5"/>'
defs='''  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="#fdfbf6"/>
      <stop offset=".75" stop-color="#f3ecdd"/>
      <stop offset="1" stop-color="#dccdaf"/>
    </radialGradient>
    <clipPath id="o"><ellipse cx="60" cy="75" rx="46" ry="60"/></clipPath>
  </defs>
  <rect width="120" height="150" fill="#2a2219"/>
  <ellipse cx="60" cy="75" rx="46" ry="60" fill="url(#g)"/>
'''
ende='''  <ellipse cx="60" cy="75" rx="46" ry="60" fill="none" stroke="#c8a96a" stroke-width="2.5"/>
  <ellipse cx="60" cy="75" rx="50.5" ry="64.5" fill="none" stroke="#c8a96a" stroke-opacity=".55" stroke-width="1"/>
</svg>
'''
# Lokale Figur (Box ~16..87 x 16..114) ins Oval setzen
T='translate(9 13) scale(1.0)'
TF='translate(120 0) scale(-1 1) translate(9 13) scale(1.0)'
def svg(label, inner, transform, extra=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" role="img" aria-label="{label}">\n{defs}  <g clip-path="url(#o)" fill="#0d0b08"{extra}>\n    <g transform="{transform}">{inner}</g>\n  </g>\n{ende}'
m=f'<path d="{kurve(MANN,SCHARF_M)}"/>'
f=f'{DUTT}<path d="{kurve(FRAU,SCHARF_F)}"/>'
open('silhouette-m.svg','w').write(svg('Scherenschnitt eines Mannes', m, T))
open('silhouette-f.svg','w').write(svg('Scherenschnitt einer Frau', f, TF))
open('silhouette-u.svg','w').write(svg('Scherenschnitt einer Person', m, T, ' fill-opacity=".6"'))
