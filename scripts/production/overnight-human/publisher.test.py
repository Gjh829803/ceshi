import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('campaign_publisher',Path(__file__).with_name('publisher.py'))
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)

class SnapshotPublicationTests(unittest.TestCase):
    def test_failed_later_attempt_does_not_hide_an_existing_checkpoint(self):
        checkpoint={'status':'failed','checkpoint':{'playable':'checkpoints/original/index.html'}}
        failed={'status':'failed'}
        self.assertEqual(publisher.choose_case(checkpoint,failed),checkpoint)
        self.assertTrue(publisher.has_playable(checkpoint))
        self.assertFalse(publisher.has_playable(failed))

    def test_final_delivery_supersedes_checkpoint_and_stays_visible(self):
        checkpoint={'status':'failed','checkpoint':{'playable':'checkpoints/original/index.html'}}
        final={'status':'ready','playable':'final/index.html'}
        self.assertEqual(publisher.choose_case(checkpoint,final),final)
        self.assertEqual(publisher.choose_case(final,checkpoint),final)
        self.assertEqual(publisher.choose_case(final,{'status':'failed'}),final)

if __name__=='__main__':unittest.main()
