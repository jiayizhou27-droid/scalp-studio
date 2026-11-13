import unittest
import numpy as np
from .geometry import pack_geometry


class GeometryTests(unittest.TestCase):
    def scene(self):
        x,y=np.meshgrid(np.linspace(-.4,.4,45),np.linspace(-.6,.6,45))
        world=np.stack((x,y,2+.1*x*x),-1)[None].repeat(3,0)
        colors=np.zeros_like(world)+np.array([.8,.5,.3])
        masks=np.zeros(world.shape[:-1]);masks[:,8:37,8:37]=1
        confidence=np.ones_like(masks)
        ext=np.column_stack((np.eye(3),np.zeros(3)))
        return world,colors,masks,confidence,ext

    def test_foreground_only_and_color_preserved(self):
        w,c,m,q,e=self.scene();w[m==0]=10000
        result=pack_geometry(w,c,m,q,e)
        p=np.array(result['positions']).reshape(-1,3)
        self.assertLess(np.max(np.abs(p)),1.5)
        self.assertEqual(result['representation'],'colored_point_cloud')
        np.testing.assert_array_equal(np.array(result['colors']).reshape(-1,3)[0],[204,128,76])
        self.assertFalse(result['metric_scale'])

    def test_missing_foreground_does_not_create_template(self):
        w,c,m,q,e=self.scene();m[:]=0
        with self.assertRaises(ValueError):pack_geometry(w,c,m,q,e)

    def test_invalid_depth_is_removed(self):
        w,c,m,q,e=self.scene();w[:,15,15]=np.nan
        result=pack_geometry(w,c,m,q,e)
        self.assertTrue(np.isfinite(result['positions']).all())

    def test_mask_alignment_required(self):
        w,c,m,q,e=self.scene()
        with self.assertRaises(ValueError):pack_geometry(w,c,m[:,:-1],q,e)

if __name__=='__main__':unittest.main()
