#!/usr/bin/env python3
"""Подложка карты: Natural Earth (public domain) -> упрощённые SVG-path.
Данные: https://github.com/nvkelso/natural-earth-vector (geojson/ne_10m_land, ne_10m_lakes, ne_10m_rivers_lake_centerlines).
Проекция: X = lon*cos(54°)*1000, Y = (64-lat)*1000 (равнопромежуточная с поправкой на широту; единицы 0,001°).
Запуск: python3 tools/build_map.py DIR_С_GEOJSON OUT.json   (нужен shapely)
"""
import json, math, sys, os
from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, MultiLineString, GeometryCollection
K = math.cos(math.radians(54))
def prj(lon, lat): return (lon * K * 1000, (64 - lat) * 1000)
def load(d, n): return json.load(open(os.path.join(d, n + '.geojson')))['features']
def fmt(v): return str(int(round(v)))
def ring_path(coords):
    pts = [(round(x), round(y)) for x, y in (prj(*c[:2]) for c in coords)]
    out = []; prev = None
    for p in pts:
        if p == prev: continue
        out.append(p); prev = p
    if len(out) > 1 and out[0] == out[-1]: out.pop()
    if len(out) < 3: return ''
    s = 'M%d %d' % out[0]; l = ' '.join('%d %d' % (b[0] - a[0], b[1] - a[1]) for a, b in zip(out, out[1:]))
    return s + 'l' + l + 'z'
def line_path(coords):
    pts = []
    for c in coords:
        p = tuple(round(v) for v in prj(*c[:2]))
        if not pts or p != pts[-1]: pts.append(p)
    if len(pts) < 2: return ''
    return 'M%d %d' % pts[0] + 'l' + ' '.join('%d %d' % (b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
def polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)): return [p for x in g.geoms for p in polys(x)]
    return []
def lines(g):
    if g.is_empty: return []
    if isinstance(g, LineString): return [g]
    if isinstance(g, (MultiLineString, GeometryCollection)): return [p for x in g.geoms for p in lines(x)]
    return []
def area_pl(p): # приблизительная площадь, кв. град (с поправкой)
    return p.area * K
def build(src, clip, tol, min_area, rivers=None, lake_min=0):
    b = box(*clip)
    land = shape({'type': 'GeometryCollection', 'geometries': [f['geometry'] for f in src['land']]}) if False else None
    from shapely.ops import unary_union
    land = unary_union([shape(f['geometry']) for f in src['land']]).intersection(b)
    lakes = unary_union([shape(f['geometry']) for f in src['lakes']]).intersection(b)
    res = {}
    # суша
    L = [p.simplify(tol, preserve_topology=True) for p in polys(land) if area_pl(p) >= min_area]
    d = ''
    for p in L:
        d += ring_path(p.exterior.coords)
        for h in p.interiors:
            if area_pl(Polygon(h)) >= min_area: d += ring_path(h.coords)
    res['land'] = d
    # озёра (внутренние воды)
    d = ''
    for p in polys(lakes):
        if area_pl(p) < lake_min: continue
        p = p.simplify(tol, preserve_topology=True)
        if p.is_empty: continue
        for q in polys(p): d += ring_path(q.exterior.coords)
    res['lakes'] = d
    # реки
    d = ''; used = []
    for f in src['rivers']:
        nm = f['properties'].get('name')
        if nm not in rivers: continue
        g = shape(f['geometry']).intersection(b)
        for ln in lines(g):
            ln = ln.simplify(tol, preserve_topology=True)
            d += line_path(ln.coords)
        used.append(nm)
    res['rivers'] = d; res['river_names'] = sorted(set(used))
    return res
if __name__ == '__main__':
    src_dir, out = sys.argv[1], sys.argv[2]
    src = {'land': load(src_dir, 'ne_10m_land'), 'lakes': load(src_dir, 'ne_10m_lakes'), 'rivers': load(src_dir, 'ne_10m_rivers_lake_centerlines')}
    allv = build(src, (3, 43, 42, 64), 0.035, 0.012, ['Dnipro', 'Volkhov', 'Vistula', 'Oder', 'Elbe', 'Daugava', 'Neman', 'Dniester', 'Narva', 'Neva'], 0.15)
    west = build(src, (8, 50.8, 18, 57.2), 0.004, 0.0004, ['Oder', 'Elbe', 'Havel', 'Warta', 'Vistula'], 0.004)
    json.dump({'all': allv, 'west': west}, open(out, 'w'), ensure_ascii=False)
    for k, v in (('all', allv), ('west', west)):
        print(k, {a: len(b) for a, b in v.items() if a != 'river_names'}, v['river_names'])
